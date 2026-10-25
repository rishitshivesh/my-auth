import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryRunner, Repository } from "typeorm";
import { tenantStorage } from "@/core/database/tenant-context.service";
import { SecurityEvent, SecurityEventType } from "@repo/database";
import { redactMetadata } from "./audit-redaction";
import { DomainEventName, DomainEventsService } from "./domain-events.service";

export interface LogSecurityEventDto {
  tenantId: string;
  eventType: SecurityEventType;
  severity: "info" | "medium" | "warning" | "high" | "critical";
  ipAddress: string;
  userAgent: string;
  userId?: string;
  /** Denormalized copy of the actor email at event time (survives user deletion). */
  actorEmail?: string;
  /** OAuth client that triggered this event. */
  applicationId?: string;
  /** ID of the affected entity (sessionId, apiKeyId, userId being modified, …). */
  resourceId?: string;
  /** Type of the affected entity: 'session', 'user', 'api_key', … */
  resourceType?: string;
  metadata?: Record<string, unknown>;
  /** Correlation id from the originating request (x-request-id). */
  requestId?: string;
  /** Defaults to 'success'. */
  outcome?: "success" | "failure";
}

/**
 * SecurityEventService
 *
 * Single write-layer for all security audit events.
 *
 * Key guarantees:
 * 1. log() is **fire-and-forget** — it never throws to the caller.
 *    A DB failure emits a structured WARN log instead of propagating.
 * 2. Metadata is passed through the recursive redactor (audit-redaction.ts).
 */
@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    /** Optional so the audit writer keeps working where no event bus is wired. */
    @Optional() private readonly domainEvents?: DomainEventsService,
  ) {}

  /**
   * Fire-and-forget security event log.
   * Returns void; DB failures are swallowed and emitted as warnings.
   */
  log(data: LogSecurityEventDto): void {
    const written = this.persist(data);
    const tracked: Promise<unknown> = written.then(() => undefined, () => undefined);
    this.inFlight.add(tracked);
    void tracked.then(() => this.inFlight.delete(tracked));
    written.then(
      (securityEventId) => this.publish(data, securityEventId),
      (err: unknown) => {
        this.logger.warn("[SecurityEvent] Failed to persist audit event", {
          eventType: data.eventType,
          tenantId: data.tenantId,
          userId: data.userId,
          error: err instanceof Error ? err.message : String(err),
        });
        // A failed attempt (e.g. a rejected login) happened even if the request that
        // observed it rolled back its audit row, so subscribers still hear about it.
        if (data.outcome === "failure") this.publish(data, undefined);
      },
    );
  }

  /** Called only after the audit row is written (or for failures, see log()). */
  private publish(data: LogSecurityEventDto, securityEventId: string | undefined): void {
    this.domainEvents?.publish(DomainEventName.SECURITY_EVENT, {
      tenantId: data.tenantId,
      userId: data.userId,
      email: data.actorEmail,
      requestId: data.requestId,
      securityEventId,
      securityEventType: data.eventType,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      outcome: data.outcome ?? "success",
      metadata: SecurityEventService.sanitizeMetadata(data.metadata ?? {}),
    });
  }

  private static persistedSeverity(severity: LogSecurityEventDto["severity"]): "info" | "warning" | "critical" {
    if (severity === "high" || severity === "critical") return "critical";
    if (severity === "medium" || severity === "warning") return "warning";
    return "info";
  }

  /**
   * Resolves when every event logged so far has been written. Callers that leave the
   * tenant context right after logging (job runners) await this so the write is not cut off.
   */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  private async persist(data: LogSecurityEventDto): Promise<string | undefined> {
    const row = {
      tenantId: data.tenantId,
      userId: data.userId,
      eventType: data.eventType,
      // The DB enum only has info/warning/critical; map the finer levels onto it
      // (writing medium/high used to fail silently and drop the audit event).
      severity: SecurityEventService.persistedSeverity(data.severity),
      ipAddress: data.ipAddress || "0.0.0.0",
      userAgent: data.userAgent || "unknown",
      metadata: SecurityEventService.sanitizeMetadata(data.metadata ?? {}),
      actorEmail: data.actorEmail,
      applicationId: data.applicationId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requestId: data.requestId,
      outcome: data.outcome ?? "success",
    };

    // log() is fire-and-forget, so the write can run after the request finished and its
    // QueryRunner was reset to search_path=public / released (the cause of
    // "relation security_events does not exist"). Inside a tenant request, write on our own
    // short-lived connection pinned to the schema captured now. This also keeps the audit
    // row independent of the request's transaction (a rolled-back request still leaves its trail).
    const ctx = tenantStorage.getStore();
    if (ctx) return this.persistInSchema(ctx.queryRunner, ctx.schemaName, row);

    // No tenant context: default connection. transaction:false so the save never becomes the
    // transaction owner of a caller's runner.
    const saved = await this.securityEventRepository.save(row, { transaction: false });
    return saved?.id;
  }

  private async persistInSchema(
    requestRunner: QueryRunner,
    schemaName: string,
    row: Partial<SecurityEvent>,
  ): Promise<string | undefined> {
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error("Refusing to write audit event: invalid tenant schema name");
    }
    const qr = requestRunner.connection.createQueryRunner();
    try {
      await qr.connect();
      await qr.query(`SET search_path TO "${schemaName}", public`);
      const saved = await qr.manager.save(SecurityEvent, row, { transaction: false });
      return saved?.id;
    } finally {
      try {
        await qr.query("SET search_path TO public");
      } catch {
        // connection may already be broken; release below discards it
      }
      await qr.release();
    }
  }

  /** Recursive redactor; see audit-redaction.ts. */
  static sanitizeMetadata(obj: unknown): Record<string, unknown> {
    return redactMetadata(obj);
  }
}

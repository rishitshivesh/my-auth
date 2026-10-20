import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SecurityEvent, SecurityEventType } from "@repo/database";
import { redactMetadata } from "./audit-redaction";

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

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
  ) {}

  /**
   * Fire-and-forget security event log.
   * Returns void; DB failures are swallowed and emitted as warnings.
   */
  log(data: LogSecurityEventDto): void {
    this.persist(data).catch((err: unknown) => {
      this.logger.warn("[SecurityEvent] Failed to persist audit event", {
        eventType: data.eventType,
        tenantId: data.tenantId,
        userId: data.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async persist(data: LogSecurityEventDto): Promise<void> {
    await this.securityEventRepository.save({
      tenantId: data.tenantId,
      userId: data.userId,
      eventType: data.eventType,
      severity: data.severity,
      ipAddress: data.ipAddress || "0.0.0.0",
      userAgent: data.userAgent || "unknown",
      metadata: SecurityEventService.sanitizeMetadata(data.metadata ?? {}),
      actorEmail: data.actorEmail,
      applicationId: data.applicationId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requestId: data.requestId,
      outcome: data.outcome ?? "success",
    });
  }

  /** Recursive redactor; see audit-redaction.ts. */
  static sanitizeMetadata(obj: unknown): Record<string, unknown> {
    return redactMetadata(obj);
  }
}

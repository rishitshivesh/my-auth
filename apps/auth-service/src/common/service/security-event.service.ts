import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SecurityEvent, SecurityEventType } from "@repo/database";

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
}

/**
 * SecurityEventService
 *
 * Single write-layer for all security audit events.
 *
 * Key guarantees:
 * 1. log() is **fire-and-forget** — it never throws to the caller.
 *    A DB failure emits a structured WARN log instead of propagating.
 * 2. sanitizeMetadata() recursively strips any key whose name
 *    (case-insensitive) contains: password | secret | token | hash | key |
 *    credential | private — so raw sensitive values never reach the DB.
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
    });
  }

  /** Key fragments that mark a value as secret material. */
  private static readonly SENSITIVE_KEY =
    /password|passwd|secret|token|hash|key|credential|private|otp|cookie|authorization/i;

  /**
   * Suffixes that describe secret material without containing it
   * (tokenExpiry, keyId, secretType, passwordChangedAt ...). These are kept so
   * audit events stay useful.
   */
  private static readonly DESCRIPTOR_SUFFIX =
    /(expiry|expires|expiresat|expiresin|ttl|type|count|length|id|ids|version|alg|algorithm|changedat|createdat|rotatedat|usedat)$/i;

  private static isSensitiveKey(key: string): boolean {
    if (!SecurityEventService.SENSITIVE_KEY.test(key)) return false;
    const normalised = key.replace(/[_-]/g, "");
    return !SecurityEventService.DESCRIPTOR_SUFFIX.test(normalised);
  }

  /**
   * Returns a copy of `obj` with secret-bearing keys removed, recursively —
   * including objects nested inside arrays (previously arrays were copied
   * verbatim, so `items: [{ password }]` reached the audit log).
   *
   * A key is removed when its name contains a sensitive fragment (password,
   * secret, token, hash, key, credential, private, otp, cookie,
   * authorization) unless it ends in a descriptor suffix (Expiry, Id, Type,
   * Count, ...). Non-object inputs return {}. Pure function.
   */
  static sanitizeMetadata(obj: unknown): Record<string, unknown> {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      return {};
    }
    return SecurityEventService.sanitizeObject(obj as Record<string, unknown>);
  }

  private static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SecurityEventService.isSensitiveKey(k)) continue;
      result[k] = SecurityEventService.sanitizeValue(v);
    }
    return result;
  }

  private static sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => SecurityEventService.sanitizeValue(item));
    }
    if (typeof value === "object" && value !== null && !(value instanceof Date)) {
      return SecurityEventService.sanitizeObject(value as Record<string, unknown>);
    }
    return value;
  }
}

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SecurityEventType, Tenant } from "@repo/database";
import {
  DomainEvent,
  DomainEventName,
  DomainEventsService,
} from "@/common/service/domain-events.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { EVENT_DISPATCH_DELAY_MS, WebhookService } from "./webhook.service";

/** Audit event -> public webhook event type. Anything not listed is never sent. */
export const WEBHOOK_EVENT_TYPES: Readonly<Record<string, string>> = {
  [SecurityEventType.USER_REGISTERED]: "user.created",
  [SecurityEventType.SOCIAL_USER_CREATED]: "user.created",
  [SecurityEventType.USER_UPDATED]: "user.updated",
  [SecurityEventType.USER_DELETED]: "user.deleted",
  [SecurityEventType.LOGIN_SUCCESS]: "user.login",
  [SecurityEventType.SOCIAL_LOGIN_SUCCESS]: "user.login",
  [SecurityEventType.LOGIN_FAILED]: "login.failed",
  [SecurityEventType.PASSWORD_CHANGED]: "password.changed",
  [SecurityEventType.PASSWORD_RESET_COMPLETED]: "password.changed",
  [SecurityEventType.TOTP_ENABLED]: "mfa.enabled",
  [SecurityEventType.TOTP_DISABLED]: "mfa.disabled",
  [SecurityEventType.SESSION_REVOKED]: "session.revoked",
  [SecurityEventType.ALL_SESSIONS_REVOKED]: "session.revoked",
  [SecurityEventType.ROLE_ASSIGNED]: "role.assigned",
  [SecurityEventType.ROLE_REMOVED]: "role.removed",
  [SecurityEventType.TENANT_SETTINGS_UPDATED]: "tenant.updated",
  [SecurityEventType.BRANDING_UPDATED]: "tenant.updated",
};

/** The catalog documented for subscribers. */
export const WEBHOOK_EVENT_CATALOG: readonly string[] = [
  ...new Set(Object.values(WEBHOOK_EVENT_TYPES)),
];

/** Audit metadata keys safe to expose to subscribers (no free text, no PII). */
const SAFE_METADATA_KEYS = [
  "roles",
  "role",
  "mode",
  "reason",
  "sessionId",
  "revokedSessions",
  "method",
  "authMethod",
] as const;

export function buildWebhookData(event: DomainEvent): Record<string, unknown> {
  const { payload } = event;
  const metadata: Record<string, unknown> = {};
  for (const key of SAFE_METADATA_KEYS) {
    const value = payload.metadata?.[key];
    if (value !== undefined) metadata[key] = value;
  }
  return {
    userId: payload.userId ?? null,
    email: payload.email ?? null,
    resourceId: payload.resourceId ?? null,
    resourceType: payload.resourceType ?? null,
    outcome: payload.outcome ?? "success",
    requestId: payload.requestId ?? null,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * Turns audit/security domain events into tenant-scoped webhook deliveries.
 * Runs outside the originating request (its own tenant context and a short
 * enqueue delay), so it never joins - or outlives - the request transaction.
 */
@Injectable()
export class WebhookEventDispatcher implements OnModuleInit {
  private readonly logger = new Logger(WebhookEventDispatcher.name);

  constructor(
    private readonly events: DomainEventsService,
    private readonly webhooks: WebhookService,
    private readonly tenantJobs: TenantJobRunner,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.events.on(DomainEventName.SECURITY_EVENT, (event) => this.dispatch(event));
  }

  async dispatch(event: DomainEvent): Promise<void> {
    const type = WEBHOOK_EVENT_TYPES[event.payload.securityEventType ?? ""];
    if (!type) return;

    const { tenantId } = event.payload;
    const tenant = await this.dataSource.manager.findOne(Tenant, {
      where: { id: tenantId },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      this.logger.warn(`Webhook dispatch skipped, unknown tenant ${tenantId}`);
      return;
    }

    await this.tenantJobs.runInTenant(tenant.slug, () =>
      this.webhooks.emit(tenant.id, type, buildWebhookData(event), {
        occurredAt: event.occurredAt,
        delayMs: EVENT_DISPATCH_DELAY_MS,
      }),
    );
  }
}

import { Injectable, Logger } from "@nestjs/common";

export const DomainEventName = {
  SESSION_REFRESH_REUSE_DETECTED: "session.refresh_reuse_detected",
  PASSKEY_REMOVED: "passkey.removed",
  MFA_ENABLED: "mfa.enabled",
  MFA_DISABLED: "mfa.disabled",
  PASSWORD_CHANGED: "password.changed",
  ACCOUNT_LOCKED: "account.locked",
  OWNERSHIP_TRANSFERRED: "tenant.ownership_transferred",
  /** Published once a security/audit event row is written; carries `securityEventType`. */
  SECURITY_EVENT: "security.event",
} as const;

export type DomainEventName =
  (typeof DomainEventName)[keyof typeof DomainEventName];

/** Payloads carry ids, not personal data; email is only the delivery address. */
export interface DomainEventPayload {
  tenantId: string;
  userId?: string;
  /** Delivery address for notifications; never logged or persisted by the bus. */
  email?: string;
  ip?: string;
  requestId?: string;
  /** Counterparty user id (e.g. new owner on ownership transfer). */
  targetUserId?: string;
  targetEmail?: string;
  /** Display names, used only to address notification emails. */
  name?: string;
  targetName?: string;
  tenantName?: string;
  /** Account lock duration, for the account-locked notification. */
  unlockMinutes?: number;
  /** SECURITY_EVENT only: the persisted audit row and its SecurityEventType. */
  securityEventId?: string;
  securityEventType?: string;
  resourceId?: string;
  resourceType?: string;
  outcome?: "success" | "failure";
  /** SECURITY_EVENT only: already-redacted audit metadata. */
  metadata?: Record<string, unknown>;
}

export interface DomainEvent {
  name: DomainEventName;
  occurredAt: Date;
  payload: Readonly<DomainEventPayload>;
}

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process event bus. Publish after the originating transaction commits.
 * A failing handler never breaks the caller or other handlers.
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly handlers = new Map<DomainEventName, Set<DomainEventHandler>>();

  on(name: DomainEventName, handler: DomainEventHandler): () => void {
    const set = this.handlers.get(name) ?? new Set<DomainEventHandler>();
    set.add(handler);
    this.handlers.set(name, set);
    return () => {
      set.delete(handler);
    };
  }

  publish(name: DomainEventName, payload: DomainEventPayload): void {
    const event: DomainEvent = { name, occurredAt: new Date(), payload };
    for (const handler of this.handlers.get(name) ?? []) {
      void Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) => {
          this.logger.error(
            `Domain event handler failed: ${name} (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        });
    }
  }
}

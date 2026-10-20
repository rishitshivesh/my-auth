import { Injectable, OnModuleInit } from "@nestjs/common";
import type { EmailPropsByName } from "@repo/emails";
import { MailService } from "@/modules/mail";
import {
  DomainEvent,
  DomainEventName,
  DomainEventsService,
} from "@/common/service/domain-events.service";
import {
  DEFAULT_RECIPIENT_NAME,
  DEFAULT_UNLOCK_MINUTES,
} from "./notifier.constants";

const WHEN_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** e.g. "14 Oct 2026, 10:32 UTC" */
export function formatWhen(date: Date): string {
  return `${WHEN_FORMAT.format(date)} UTC`;
}

/** Subscribes to security domain events and sends the matching alert email. */
@Injectable()
export class SecurityNotifierService implements OnModuleInit {
  constructor(
    private readonly events: DomainEventsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    const bind = this.events.on.bind(this.events);
    bind(DomainEventName.SESSION_REFRESH_REUSE_DETECTED, (e) =>
      this.alert("session-reuse-alert", e),
    );
    bind(DomainEventName.PASSKEY_REMOVED, (e) => this.alert("passkey-removed", e));
    bind(DomainEventName.MFA_ENABLED, (e) => this.alert("mfa-enabled", e));
    bind(DomainEventName.MFA_DISABLED, (e) => this.alert("mfa-disabled", e));
    bind(DomainEventName.PASSWORD_CHANGED, (e) => this.alert("password-changed", e));
    bind(DomainEventName.ACCOUNT_LOCKED, (e) => this.accountLocked(e));
    bind(DomainEventName.OWNERSHIP_TRANSFERRED, (e) => this.ownershipTransferred(e));
  }

  private async alert(
    template: "session-reuse-alert" | "passkey-removed" | "mfa-enabled" | "mfa-disabled" | "password-changed",
    event: DomainEvent,
  ): Promise<void> {
    const { email, name, ip, requestId, tenantName } = event.payload;
    if (!email) return;
    await this.mail.send(template, email, {
      name: name ?? DEFAULT_RECIPIENT_NAME,
      when: formatWhen(event.occurredAt),
      ip: ip ?? null,
      requestId,
      tenantName,
    });
  }

  private async accountLocked(event: DomainEvent): Promise<void> {
    const { email, name, ip, requestId, tenantName, unlockMinutes } = event.payload;
    if (!email) return;
    await this.mail.send("account-locked", email, {
      name: name ?? DEFAULT_RECIPIENT_NAME,
      when: formatWhen(event.occurredAt),
      ip: ip ?? null,
      unlockMinutes: unlockMinutes ?? DEFAULT_UNLOCK_MINUTES,
      requestId,
      tenantName,
    });
  }

  /** userId/email = previous owner; targetUserId/targetEmail = new owner. */
  private async ownershipTransferred(event: DomainEvent): Promise<void> {
    const { email, name, targetEmail, targetName, ip, tenantName } = event.payload;
    const when = formatWhen(event.occurredAt);
    const resolvedTenant = tenantName ?? "";
    const previousName = name ?? DEFAULT_RECIPIENT_NAME;
    const newName = targetName ?? DEFAULT_RECIPIENT_NAME;
    const sends: Array<Promise<boolean>> = [];

    if (email) {
      const props: EmailPropsByName["ownership-transferred-from"] = {
        name: previousName,
        tenantName: resolvedTenant,
        newOwnerName: newName,
        when,
        ip: ip ?? null,
      };
      sends.push(this.mail.send("ownership-transferred-from", email, props));
    }
    if (targetEmail) {
      const props: EmailPropsByName["ownership-transferred-to"] = {
        name: newName,
        tenantName: resolvedTenant,
        previousOwnerName: previousName,
        when,
        ip: ip ?? null,
      };
      sends.push(this.mail.send("ownership-transferred-to", targetEmail, props));
    }
    await Promise.all(sends);
  }
}

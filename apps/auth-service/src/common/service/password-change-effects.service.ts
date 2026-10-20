import { Injectable } from "@nestjs/common";
import { SecurityEventType, type User } from "@repo/database";
import { EmailService } from "@/modules/email/email.service";
import { SecurityEventService } from "./security-event.service";
import { SessionService } from "./session.service";

export interface PasswordChangeContext {
  user: User;
  ip: string;
  userAgent: string;
  requestId?: string;
  /** Session that stays signed in (the one that changed the password). Omit to sign out everywhere. */
  keepSessionId?: string;
  /** "password_change" | "password_reset" | "admin_password_set" ... */
  reason: string;
  eventType?: SecurityEventType;
}

/**
 * What must follow every successful password change, wherever it happens
 * (self-service change, reset, admin set): other sessions and refresh tokens
 * are revoked, the user is emailed, and a SecurityEvent is recorded with the
 * request id so the email, the event and the API call can be correlated.
 */
@Injectable()
export class PasswordChangeEffectsService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async afterPasswordChange(ctx: PasswordChangeContext): Promise<void> {
    const { user, ip, userAgent, requestId, keepSessionId, reason } = ctx;

    const revokedSessionIds = await this.sessionService.revokeOtherUserSessions(
      user.tenantId,
      user.id,
      keepSessionId,
      reason,
    );

    this.securityEventService.log({
      tenantId: user.tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: ctx.eventType ?? SecurityEventType.PASSWORD_CHANGED,
      severity: "info",
      ipAddress: ip,
      userAgent,
      requestId,
      metadata: { reason, revokedSessions: revokedSessionIds.length },
    });

    // Queued by EmailService; never throws, so a mail outage cannot undo the change.
    await this.emailService.sendPasswordChangedEmail(user, {
      ipAddress: ip,
      requestId,
    });
  }
}

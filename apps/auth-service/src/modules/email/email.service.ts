/**
 * Email Service (facade)
 *
 * Keeps the public method names callers already use, builds the template
 * props and hands them to MailService, which queues the send. Rendering and
 * delivery happen in the mail worker (modules/mail). EMAIL_SENT security
 * events are logged at enqueue time.
 */

import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, Tenant, SecurityEventType } from "@repo/database";
import type { EmailName, EmailPropsByName } from "@repo/emails";
import { SecurityEventService } from "@/common/service/security-event.service";
import { MailService } from "@/modules/mail/mail.service";
import { logger } from "@/common/logger";

const VERIFY_EMAIL_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_MINUTES = 60;
const PASSWORD_RESET_OTP_EXPIRY_MINUTES = 15;
const MAGIC_LINK_EXPIRY_MINUTES = 10;
const OTP_EXPIRY_MINUTES = 10;
const ACCOUNT_LINK_EXPIRY_MINUTES = 60;
const ACCOUNT_PURGE_GRACE_DAYS = 30;
const DEFAULT_INVITE_ROLE = "member";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMAIL_EVENT_USER_AGENT = "email-service";
const EMAIL_EVENT_IP = "0.0.0.0";

export type SecurityAlertTemplate =
  | "session-reuse-alert"
  | "mfa-enabled"
  | "mfa-disabled"
  | "passkey-added"
  | "passkey-removed";

/** Context for security-alert emails (when / where the action happened). */
export interface AlertContext {
  ipAddress?: string | null;
  requestId?: string;
  when?: Date;
}

interface AlertProps {
  name: string;
  when: string;
  ip: string | null;
  requestId?: string;
  tenantName?: string;
}

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly securityEventService: SecurityEventService,
    private readonly mailService: MailService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  private frontendUrl(path: string, token: string): string {
    const base = this.configService.get<string>("FRONTEND_URL")?.trim().replace(/\/+$/, "");
    if (!base || !/^https?:\/\/[^\s/]/i.test(base)) {
      // Never emit "undefined/..." links; env.validation.ts rejects this at boot.
      logger.error("FRONTEND_URL is missing or not an http(s) URL; refusing to build email link");
      throw new ApiException("INTERNAL_ERROR", { detail: "Email links are not configured" });
    }
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  private displayName(user: User): string {
    return user.firstName || user.email.split("@")[0] || user.email;
  }

  private formatWhen(when: Date = new Date()): string {
    return `${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }

  private async getTenantName(tenantId: string): Promise<string | undefined> {
    try {
      const tenant = await this.tenantRepository.findOne({
        where: { id: tenantId },
      });
      return tenant?.name || undefined;
    } catch {
      logger.warn({ tenantId }, "Failed to load tenant branding, using defaults");
      return undefined;
    }
  }

  private async alertProps(user: User, ctx: AlertContext): Promise<AlertProps> {
    return {
      name: this.displayName(user),
      when: this.formatWhen(ctx.when),
      ip: ctx.ipAddress ?? null,
      requestId: ctx.requestId,
      tenantName: await this.getTenantName(user.tenantId),
    };
  }

  /** Queue an email and log the EMAIL_SENT security event (at enqueue). */
  private async dispatch<N extends EmailName>(
    template: N,
    to: string,
    props: EmailPropsByName[N],
    meta: { tenantId: string; userId?: string; emailType: string },
  ): Promise<boolean> {
    const queued = await this.mailService.send(template, to, props);
    this.securityEventService.log({
      tenantId: meta.tenantId,
      userId: meta.userId,
      eventType: SecurityEventType.EMAIL_SENT,
      severity: queued ? "info" : "warning",
      ipAddress: EMAIL_EVENT_IP,
      userAgent: EMAIL_EVENT_USER_AGENT,
      metadata: {
        emailType: meta.emailType,
        // recipient email is retained for audit traceability — not a secret
        recipient: to,
        queued,
      },
    });
    return queued;
  }

  /** Welcome email: the verification email is the welcome message. */
  async sendWelcomeEmail(user: User, verificationToken: string): Promise<boolean> {
    return this.sendVerificationEmail(user, verificationToken, "welcome");
  }

  async sendVerificationEmail(
    user: User,
    verificationToken: string,
    emailType = "verification",
  ): Promise<boolean> {
    return this.dispatch(
      "verify-email",
      user.email,
      {
        name: this.displayName(user),
        verifyUrl: this.frontendUrl("/verify-email", verificationToken),
        expiresInHours: VERIFY_EMAIL_EXPIRY_HOURS,
        tenantName: await this.getTenantName(user.tenantId),
      },
      { tenantId: user.tenantId, userId: user.id, emailType },
    );
  }

  async sendPasswordResetEmail(user: User, resetToken: string): Promise<boolean> {
    return this.dispatch(
      "password-reset",
      user.email,
      {
        name: this.displayName(user),
        resetUrl: this.frontendUrl("/reset-password", resetToken),
        expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
        tenantName: await this.getTenantName(user.tenantId),
      },
      { tenantId: user.tenantId, userId: user.id, emailType: "password_reset" },
    );
  }

  async sendPasswordResetOtpEmail(user: User, otp: string): Promise<boolean> {
    return this.sendOtp(user, otp, PASSWORD_RESET_OTP_EXPIRY_MINUTES, "password_reset_otp");
  }

  async sendOTPEmail(user: User, otpCode: string): Promise<boolean> {
    return this.sendOtp(user, otpCode, OTP_EXPIRY_MINUTES, "otp");
  }

  private async sendOtp(
    user: User,
    code: string,
    expiresInMinutes: number,
    emailType: string,
  ): Promise<boolean> {
    return this.dispatch(
      "otp-code",
      user.email,
      {
        name: this.displayName(user),
        code,
        expiresInMinutes,
        tenantName: await this.getTenantName(user.tenantId),
      },
      { tenantId: user.tenantId, userId: user.id, emailType },
    );
  }

  async sendPasswordChangedEmail(user: User, ctx: AlertContext = {}): Promise<boolean> {
    return this.dispatch(
      "password-changed",
      user.email,
      await this.alertProps(user, ctx),
      { tenantId: user.tenantId, userId: user.id, emailType: "password_changed" },
    );
  }

  async sendMagicLinkEmail(user: User, magicLinkToken: string): Promise<boolean> {
    return this.dispatch(
      "magic-link",
      user.email,
      {
        name: this.displayName(user),
        magicLinkUrl: this.frontendUrl("/u/magic-link", magicLinkToken),
        expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
        tenantName: await this.getTenantName(user.tenantId),
      },
      { tenantId: user.tenantId, userId: user.id, emailType: "magic_link" },
    );
  }

  async sendInviteEmail(data: {
    to: string;
    inviterName: string;
    tenantName: string;
    tenantId: string;
    inviteUrl: string;
    expiresInDays: number;
    role?: string;
  }): Promise<boolean> {
    return this.dispatch(
      "invitation",
      data.to,
      {
        inviterName: data.inviterName,
        tenantName: data.tenantName,
        role: data.role ?? DEFAULT_INVITE_ROLE,
        acceptUrl: data.inviteUrl,
        expiresInDays: data.expiresInDays,
      },
      { tenantId: data.tenantId, emailType: "invite" },
    );
  }

  async sendAccountDeletedEmail(user: User, purgeOn?: Date): Promise<boolean> {
    const purgeDate =
      purgeOn ?? new Date(Date.now() + ACCOUNT_PURGE_GRACE_DAYS * MS_PER_DAY);
    return this.dispatch(
      "account-deleted",
      user.email,
      {
        name: this.displayName(user),
        purgeOn: purgeDate.toISOString().slice(0, 10),
        tenantName: await this.getTenantName(user.tenantId),
      },
      { tenantId: user.tenantId, userId: user.id, emailType: "account_deleted" },
    );
  }

  async sendAccountLockedEmail(
    user: User,
    unlockMinutes: number,
    ctx: AlertContext = {},
  ): Promise<boolean> {
    return this.dispatch(
      "account-locked",
      user.email,
      { ...(await this.alertProps(user, ctx)), unlockMinutes },
      { tenantId: user.tenantId, userId: user.id, emailType: "account_locked" },
    );
  }

  async sendAccountLinkRequest(data: {
    user: User;
    provider: string;
    token: string;
  }): Promise<boolean> {
    return this.dispatch(
      "social-account-link-request",
      data.user.email,
      {
        name: this.displayName(data.user),
        provider: data.provider,
        confirmUrl: this.frontendUrl("/u/link/confirm", data.token),
        expiresInMinutes: ACCOUNT_LINK_EXPIRY_MINUTES,
        tenantName: await this.getTenantName(data.user.tenantId),
      },
      { tenantId: data.user.tenantId, userId: data.user.id, emailType: "account_link_request" },
    );
  }

  /** Security alerts that share the alert props shape. */
  async sendSecurityAlertEmail(
    template: SecurityAlertTemplate,
    user: User,
    ctx: AlertContext = {},
  ): Promise<boolean> {
    return this.dispatch(
      template,
      user.email,
      await this.alertProps(user, ctx),
      { tenantId: user.tenantId, userId: user.id, emailType: template.replace(/-/g, "_") },
    );
  }
}

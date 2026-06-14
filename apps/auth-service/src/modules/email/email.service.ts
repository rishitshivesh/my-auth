/**
 * Email Service
 *
 * Main email service that:
 * - Auto-detects which provider to use (SES > SMTP > Console)
 * - Handles email templating with Handlebars
 * - Logs all email attempts to security_events
 * - Supports multi-tenant branding
 */

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, Tenant, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import * as Handlebars from "handlebars";
import * as fs from "fs";
import * as path from "path";
import { EmailProvider } from "./providers/email-provider.interface";
import { NodeMailerProvider } from "./providers/nodemailer.provider";
import { SESProvider } from "./providers/ses.provider";
import { logger } from "@/common/logger";

@Injectable()
export class EmailService {
  private provider: EmailProvider | null = null;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly securityEventService: SecurityEventService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {
    this.initializeProvider();
  }

  /**
   * Auto-detect and initialize email provider
   * Priority: SES > SMTP > Console (development)
   */
  private initializeProvider(): void {
    const awsSesAccessKey = this.configService.get<string>(
      "AWS_SES_ACCESS_KEY_ID",
    );
    const awsSesSecretKey = this.configService.get<string>(
      "AWS_SES_SECRET_ACCESS_KEY",
    );
    const smtpHost = this.configService.get<string>("SMTP_HOST");

    if (awsSesAccessKey && awsSesSecretKey) {
      // Use SES
      this.provider = new SESProvider(this.configService);
      logger.info("Email provider: AWS SES");
    } else if (smtpHost) {
      // Use SMTP (NodeMailer)
      this.provider = new NodeMailerProvider(this.configService);
      logger.info("Email provider: SMTP (NodeMailer)");
    } else {
      // Development mode - log to console
      this.provider = null;
      logger.warn(
        "Email provider: CONSOLE (Development) - No email provider configured",
      );
    }
  }

  /**
   * Send email using the configured provider
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    tenantId: string;
    userId?: string;
    emailType: string;
  }): Promise<boolean> {
    const startTime = Date.now();
    let success = false;

    logger.info({ provider: this.provider?.getProviderName() || "console" }, "Email provider in use");

    try {
      if (this.provider) {
        // Use configured provider (SES or SMTP)
        await this.provider.sendEmail({
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        });
        success = true;
        logger.info({ to: options.to, provider: this.provider.getProviderName() }, "Email sent");
      } else {
        // Development mode - log to console
        logger.info({ to: options.to, subject: options.subject, emailType: options.emailType, htmlLength: options.html.length }, "Email (development mode)");
        success = true;
      }
    } catch (error: any) {
      logger.error({ err: error, to: options.to }, "Failed to send email");
      success = false;
    }

    // Log to security events
    await this.logEmailEvent({
      tenantId: options.tenantId,
      userId: options.userId,
      emailType: options.emailType,
      recipient: options.to,
      provider: this.provider?.getProviderName() || "console",
      success,
      duration: Date.now() - startTime,
    });

    return success;
  }

  /**
   * Load and compile template
   */
  private async loadTemplate(
    templateName: string,
  ): Promise<HandlebarsTemplateDelegate> {
    // Check cache first
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = path.join(
      __dirname,
      "../../../",
      "templates",
      `${templateName}.html`,
    );

    try {
      const templateContent = fs.readFileSync(templatePath, "utf-8");
      const compiledTemplate = Handlebars.compile(templateContent);
      this.templateCache.set(templateName, compiledTemplate);
      return compiledTemplate;
    } catch (error: any) {
      logger.error({ err: error, templateName }, "Failed to load template");
      throw new Error(`Template ${templateName} not found`);
    }
  }

  /**
   * Render template with data
   */
  private async renderTemplate(
    templateName: string,
    data: Record<string, any>,
  ): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return template({
      ...data,
      currentYear: new Date().getFullYear(),
    });
  }

  /**
   * Get tenant branding information
   */
  private async getTenantBranding(tenantId: string): Promise<{
    tenantName: string;
    tenantLogo: string;
  }> {
    try {
      const tenant = await this.tenantRepository.findOne({
        where: { id: tenantId },
      });

      return {
        tenantName: tenant?.name || "Scrolloop Sentry",
        tenantLogo:
          // TODO Tenant Logo URL
          // tenant?.metadata?.logoUrl ||
          "https://via.placeholder.com/150x50?text=Scrolloop+Sentry",
      };
    } catch (error) {
      logger.warn({ tenantId }, "Failed to load tenant branding, using defaults");
      return {
        tenantName: "Scrolloop Sentry",
        tenantLogo: "https://via.placeholder.com/150x50?text=Scrolloop+Sentry",
      };
    }
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(
    user: User,
    verificationToken: string,
  ): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);
    const verificationUrl = `${this.configService.get<string>("FRONTEND_URL")}/verify-email?token=${verificationToken}`;

    const html = await this.renderTemplate("welcome", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      actionUrl: verificationUrl,
      expiresIn: "24 hours",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: `Welcome to ${branding.tenantName}!`,
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "welcome",
    });
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(
    user: User,
    verificationToken: string,
  ): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);
    const verificationUrl = `${this.configService.get<string>("FRONTEND_URL")}/verify-email?token=${verificationToken}`;

    const html = await this.renderTemplate("verify-email", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      actionUrl: verificationUrl,
      expiresIn: "24 hours",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Verify your email address",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "verification",
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    user: User,
    resetToken: string,
  ): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);
    const resetUrl = `${this.configService.get<string>("FRONTEND_URL")}/reset-password?token=${resetToken}`;

    const html = await this.renderTemplate("password-reset", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      actionUrl: resetUrl,
      expiresIn: "1 hour",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Reset your password",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "password_reset",
    });
  }

  /**
   * Send password reset OTP email
   */
  async sendPasswordResetOtpEmail(
    user: User,
    otp: string,
  ): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);

    const html = await this.renderTemplate("otp", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      code: otp,
      expiresIn: "15 minutes",
      purpose: "password reset",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Your password reset code",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "password_reset_otp",
    });
  }

  /**
   * Send password changed confirmation
   */
  async sendPasswordChangedEmail(user: User): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);

    const html = await this.renderTemplate("password-changed", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Your password has been changed",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "password_changed",
    });
  }

  /**
   * Send magic link email
   */
  async sendMagicLinkEmail(
    user: User,
    magicLinkToken: string,
  ): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);
    const magicLinkUrl = `${this.configService.get<string>("FRONTEND_URL")}/u/magic-link?token=${magicLinkToken}`;

    const html = await this.renderTemplate("magic-link", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      actionUrl: magicLinkUrl,
      expiresIn: "10 minutes",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: `Your sign-in link for ${branding.tenantName}`,
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "magic_link",
    });
  }

  /**
   * Send OTP code email
   */
  async sendOTPEmail(user: User, otpCode: string): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);

    const html = await this.renderTemplate("otp", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      code: otpCode,
      expiresIn: "10 minutes",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Your verification code",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "otp",
    });
  }

  /**
   * Send account deleted confirmation
   */
  async sendAccountDeletedEmail(user: User): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);

    const html = await this.renderTemplate("account-deleted", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Your account has been deleted",
      html,
      tenantId: user.tenantId,
      userId: user.id,
      emailType: "account_deleted",
    });
  }

  /**
   * Log email event to security_events table
   */
  private logEmailEvent(data: {
    tenantId: string;
    userId?: string;
    emailType: string;
    recipient: string;
    provider: string;
    success: boolean;
    duration: number;
  }): void {
    this.securityEventService.log({
      tenantId: data.tenantId,
      userId: data.userId,
      eventType: SecurityEventType.EMAIL_SENT,
      severity: data.success ? "info" : "warning",
      ipAddress: "0.0.0.0",
      userAgent: "email-service",
      metadata: {
        emailType: data.emailType,
        // recipient email is retained for audit traceability — not a secret
        recipient: data.recipient,
        provider: data.provider,
        success: data.success,
        duration: data.duration,
      },
    });
  }
}

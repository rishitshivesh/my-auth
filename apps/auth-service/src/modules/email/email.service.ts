/**
 * Email Service
 *
 * Main email service that:
 * - Auto-detects which provider to use (SES > SMTP > Console)
 * - Handles email templating with Handlebars
 * - Logs all email attempts to security_events
 * - Supports multi-tenant branding
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, Tenant, SecurityEvent } from "@repo/database";
import * as Handlebars from "handlebars";
import * as fs from "fs";
import * as path from "path";
import { EmailProvider } from "./providers/email-provider.interface";
import { NodeMailerProvider } from "./providers/nodemailer.provider";
import { SESProvider } from "./providers/ses.provider";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private provider: EmailProvider | null = null;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
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
      this.logger.log("📧 Email provider: AWS SES");
    } else if (smtpHost) {
      // Use SMTP (NodeMailer)
      this.provider = new NodeMailerProvider(this.configService);
      this.logger.log("📧 Email provider: SMTP (NodeMailer)");
    } else {
      // Development mode - log to console
      this.provider = null;
      this.logger.warn(
        "📧 Email provider: CONSOLE (Development) - No email provider configured",
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
        this.logger.log(
          `✅ Email sent to ${options.to} via ${this.provider.getProviderName()}`,
        );
      } else {
        // Development mode - log to console
        console.log("\n========== EMAIL (DEVELOPMENT MODE) ==========");
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Type: ${options.emailType}`);
        console.log(`HTML Length: ${options.html.length} chars`);
        console.log("==============================================\n");
        success = true;
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to send email to ${options.to}: ${error.message}`,
        error.stack,
      );
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
  private async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    // Check cache first
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = path.join(
      __dirname,
      "templates",
      `${templateName}.html`,
    );

    try {
      const templateContent = fs.readFileSync(templatePath, "utf-8");
      const compiledTemplate = Handlebars.compile(templateContent);
      this.templateCache.set(templateName, compiledTemplate);
      return compiledTemplate;
    } catch (error) {
      this.logger.error(
        `Failed to load template ${templateName}: ${error.message}`,
      );
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
        tenantName: tenant?.name || "Fort Knox",
        tenantLogo:
          tenant?.metadata?.logoUrl ||
          "https://via.placeholder.com/150x50?text=Fort+Knox",
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load tenant branding for ${tenantId}, using defaults`,
      );
      return {
        tenantName: "Fort Knox",
        tenantLogo: "https://via.placeholder.com/150x50?text=Fort+Knox",
      };
    }
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(user: User, verificationToken: string): Promise<boolean> {
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
  async sendPasswordResetEmail(user: User, resetToken: string): Promise<boolean> {
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
  async sendMagicLinkEmail(user: User, magicLinkToken: string): Promise<boolean> {
    const branding = await this.getTenantBranding(user.tenantId);
    const magicLinkUrl = `${this.configService.get<string>("FRONTEND_URL")}/auth/magic-link?token=${magicLinkToken}`;

    const html = await this.renderTemplate("magic-link", {
      userName: user.firstName || user.email.split("@")[0],
      userEmail: user.email,
      actionUrl: magicLinkUrl,
      expiresIn: "15 minutes",
      ...branding,
    });

    return this.sendEmail({
      to: user.email,
      subject: "Your magic link to sign in",
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
  private async logEmailEvent(data: {
    tenantId: string;
    userId?: string;
    emailType: string;
    recipient: string;
    provider: string;
    success: boolean;
    duration: number;
  }): Promise<void> {
    try {
      await this.securityEventRepository.save({
        tenantId: data.tenantId,
        userId: data.userId,
        eventType: "email_sent",
        severity: data.success ? "info" : "warning",
        ipAddress: "0.0.0.0",
        userAgent: "email-service",
        metadata: {
          emailType: data.emailType,
          recipient: data.recipient,
          provider: data.provider,
          success: data.success,
          duration: data.duration,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to log email event: ${error.message}`,
        error.stack,
      );
    }
  }
}

/**
 * NodeMailer Email Provider
 *
 * SMTP-based email provider using NodeMailer.
 * Supports any SMTP server (Gmail, Outlook, custom servers, etc.)
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import { EmailProvider, EmailOptions } from "./email-provider.interface";

@Injectable()
export class NodeMailerProvider implements EmailProvider {
  private readonly logger = new Logger(NodeMailerProvider.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpPort = this.configService.get<number>("SMTP_PORT", 587);
    const smtpSecure = this.configService.get<string>("SMTP_SECURE") === "true";
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,
    });

    this.logger.log(
      `NodeMailer initialized with SMTP server: ${smtpHost}:${smtpPort}`,
    );
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const from =
      options.from ||
      `"${this.configService.get<string>("EMAIL_FROM_NAME")}" <${this.configService.get<string>("EMAIL_FROM")}>`;

    const replyTo =
      options.replyTo || this.configService.get<string>("EMAIL_REPLY_TO");

    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo,
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(", ")
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(", ")
            : options.bcc
          : undefined,
        attachments: options.attachments,
      });

      this.logger.log(`Email sent successfully via SMTP: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email via SMTP: ${error.message}`, error.stack);
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log("SMTP connection verified successfully");
      return true;
    } catch (error) {
      this.logger.error(`SMTP verification failed: ${error.message}`);
      return false;
    }
  }

  getProviderName(): string {
    return "smtp";
  }
}

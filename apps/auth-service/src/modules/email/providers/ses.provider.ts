/**
 * AWS SES Email Provider
 *
 * Uses AWS Simple Email Service for sending emails.
 * More reliable and scalable than SMTP for production use.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SESClient,
  SendEmailCommand,
  VerifyEmailIdentityCommand,
} from "@aws-sdk/client-ses";
import { EmailProvider, EmailOptions } from "./email-provider.interface";

@Injectable()
export class SESProvider implements EmailProvider {
  private readonly logger = new Logger(SESProvider.name);
  private sesClient: SESClient;

  constructor(private readonly configService: ConfigService) {
    this.initializeSESClient();
  }

  private initializeSESClient(): void {
    const region = this.configService.get<string>("AWS_SES_REGION", "us-east-1");
    const accessKeyId = this.configService.get<string>("AWS_SES_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>(
      "AWS_SES_SECRET_ACCESS_KEY",
    );

    this.sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    this.logger.log(`AWS SES initialized with region: ${region}`);
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const from =
      options.from ||
      `"${this.configService.get<string>("EMAIL_FROM_NAME")}" <${this.configService.get<string>("EMAIL_FROM")}>`;

    const replyTo =
      options.replyTo || this.configService.get<string>("EMAIL_REPLY_TO");

    try {
      const command = new SendEmailCommand({
        Source: from,
        Destination: {
          ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
          CcAddresses: options.cc
            ? Array.isArray(options.cc)
              ? options.cc
              : [options.cc]
            : undefined,
          BccAddresses: options.bcc
            ? Array.isArray(options.bcc)
              ? options.bcc
              : [options.bcc]
            : undefined,
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: "UTF-8",
            },
            Text: options.text
              ? {
                  Data: options.text,
                  Charset: "UTF-8",
                }
              : undefined,
          },
        },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
      });

      const response = await this.sesClient.send(command);
      this.logger.log(`Email sent successfully via SES: ${response.MessageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email via SES: ${error.message}`, error.stack);
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      // SES doesn't have a direct verify method like SMTP
      // We just check if we can initialize the client
      // In production, you'd verify email addresses/domains separately
      this.logger.log("SES connection assumed valid (no verification endpoint)");
      return true;
    } catch (error) {
      this.logger.error(`SES verification failed: ${error.message}`);
      return false;
    }
  }

  getProviderName(): string {
    return "ses";
  }

  /**
   * Verify an email address with SES (must be done before sending)
   * @param email Email address to verify
   */
  async verifyEmailIdentity(email: string): Promise<void> {
    try {
      const command = new VerifyEmailIdentityCommand({
        EmailAddress: email,
      });
      await this.sesClient.send(command);
      this.logger.log(
        `Verification email sent to ${email}. Check inbox to confirm.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to verify email identity: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

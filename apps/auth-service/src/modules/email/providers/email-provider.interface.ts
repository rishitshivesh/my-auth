/**
 * Email Provider Interface
 *
 * Abstract interface that all email providers must implement.
 * This allows easy switching between NodeMailer, SES, or other providers.
 */

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
  }>;
}

export interface EmailProvider {
  /**
   * Send an email
   * @param options Email options
   * @returns Promise that resolves when email is sent
   */
  sendEmail(options: EmailOptions): Promise<void>;

  /**
   * Verify connection/credentials
   * @returns Promise that resolves to true if connection is valid
   */
  verify(): Promise<boolean>;

  /**
   * Get provider name
   * @returns Name of the provider (e.g., "smtp", "ses", "console")
   */
  getProviderName(): string;
}

import type { EmailProvider } from "@/modules/email/providers/email-provider.interface";
import type { MailerPort, OutgoingMail } from "../mailer.port";

/** Adapts an existing SES / SMTP EmailProvider to the MailerPort. */
export class ProviderMailer implements MailerPort {
  constructor(private readonly provider: EmailProvider) {}

  async send(mail: OutgoingMail): Promise<void> {
    await this.provider.sendEmail({
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  }
}

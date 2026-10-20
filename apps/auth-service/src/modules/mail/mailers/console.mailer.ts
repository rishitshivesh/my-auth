import { logger } from "@/common/logger";
import type { MailerPort, OutgoingMail } from "../mailer.port";

/** Development/test only: prints the plain-text body so links can be clicked. */
export class ConsoleMailer implements MailerPort {
  async send(mail: OutgoingMail): Promise<void> {
    logger.info(
      { to: mail.to, subject: mail.subject },
      `[mail:console]\n${mail.text}`,
    );
  }
}

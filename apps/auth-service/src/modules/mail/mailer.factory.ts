import { ConfigService } from "@nestjs/config";
import { logger } from "@/common/logger";
import { NodeMailerProvider } from "@/modules/email/providers/nodemailer.provider";
import { SESProvider } from "@/modules/email/providers/ses.provider";
import type { MailerPort } from "./mailer.port";
import { ConsoleMailer } from "./mailers/console.mailer";
import { ProviderMailer } from "./mailers/provider.mailer";

/** Picks the mailer: SES > SMTP > console (console is refused in production). */
export function createMailer(config: ConfigService): MailerPort {
  if (
    config.get<string>("AWS_SES_ACCESS_KEY_ID") &&
    config.get<string>("AWS_SES_SECRET_ACCESS_KEY")
  ) {
    logger.info("Mail provider: AWS SES");
    return new ProviderMailer(new SESProvider(config));
  }
  if (config.get<string>("SMTP_HOST")) {
    logger.info("Mail provider: SMTP");
    return new ProviderMailer(new NodeMailerProvider(config));
  }
  if (config.get<string>("NODE_ENV") === "production") {
    throw new Error(
      "No mail provider configured: set AWS_SES_* or SMTP_HOST (console mailer is not allowed in production)",
    );
  }
  logger.warn("Mail provider: CONSOLE (development only)");
  return new ConsoleMailer();
}

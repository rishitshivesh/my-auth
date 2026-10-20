import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { MAIL_QUEUE } from "./mail.constants";
import { MailService } from "./mail.service";
import { MailProcessor } from "./mail.processor";
import { MAILER } from "./mailer.port";
import { createMailer } from "./mailer.factory";

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    { provide: MAILER, inject: [ConfigService], useFactory: createMailer },
    MailService,
    MailProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}

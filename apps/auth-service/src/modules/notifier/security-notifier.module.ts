import { Module } from "@nestjs/common";
import { MailModule } from "@/modules/mail";
import { DomainEventsModule } from "@/common/service/domain-events.module";
import { SecurityNotifierService } from "./security-notifier.service";

@Module({
  imports: [MailModule, DomainEventsModule],
  providers: [SecurityNotifierService],
})
export class SecurityNotifierModule {}

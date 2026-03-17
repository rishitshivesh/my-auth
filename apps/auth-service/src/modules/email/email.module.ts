/**
 * Email Module
 *
 * Provides email functionality for the auth service.
 * Auto-configures providers based on environment variables.
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { SecurityEvent, Tenant } from "@repo/database";
import { EmailService } from "./email.service";
import { EmailController } from "./email.controller";
import { NodeMailerProvider } from "./providers/nodemailer.provider";
import { SESProvider } from "./providers/ses.provider";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Tenant, SecurityEvent]),
    SecurityEventModule,
  ],
  controllers: [EmailController],
  providers: [
    EmailService,
    SecurityEventService,
    NodeMailerProvider,
    SESProvider,
  ],
  exports: [EmailService],
})
export class EmailModule {}

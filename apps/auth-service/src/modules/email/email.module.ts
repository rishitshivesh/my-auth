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

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SecurityEvent, Tenant]),
  ],
  controllers: [EmailController],
  providers: [EmailService, NodeMailerProvider, SESProvider],
  exports: [EmailService],
})
export class EmailModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  MfaSettings,
  SecurityEvent,
  Session,
  Tenant,
  User,
} from "@repo/database";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { EmailOtpService } from "@/modules/mfa/email-otp.service";
import { EmailService } from "@/modules/email/email.service";
import { UserService } from "@/modules/user/user.service";
import { EmailModule } from "@/modules/email/email.module";
import { UserModule } from "@/modules/user/user.module";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";

/**
 * MFA Module
 *
 * Handles Multi-Factor Authentication:
 * - TOTP (Google Authenticator, Authy, etc.)
 * - Backup codes
 * - MFA status management
 * - Future: SMS, Email, WebAuthn
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MfaSettings,
      User,
      SecurityEvent,
      Tenant,
      Session,
    ]),
    EmailModule,
    UserModule,
  ],
  controllers: [MfaController],
  providers: [
    MfaService,
    EmailOtpService,
    EmailService,
    UserService,
    WebAuthnService,
  ],
  exports: [MfaService], // Export for use in AuthService
})
export class MfaModule {}

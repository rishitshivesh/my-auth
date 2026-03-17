import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  MfaSettings,
  SecurityEvent,
  Session,
  Tenant,
  User,
  WebAuthnCredential,
} from "@repo/database";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { EmailOtpService } from "@/modules/mfa/email-otp.service";
import { EmailService } from "@/modules/email/email.service";
import { UserService } from "@/modules/user/user.service";
import { EmailModule } from "@/modules/email/email.module";
import { UserModule } from "@/modules/user/user.module";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";
import { RedisService } from "@/common/service/redis.service";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";

/**
 * MFA Module
 *
 * Handles Multi-Factor Authentication:
 * - TOTP (Google Authenticator, Authy, etc.)
 * - Backup codes
 * - MFA status management
 * - WebAuthn / Passkeys
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MfaSettings,
      User,
      Tenant,
      Session,
      WebAuthnCredential,
      SecurityEvent,
    ]),
    SecurityEventModule,
    EmailModule,
    UserModule,
  ],
  controllers: [MfaController],
  providers: [
    MfaService,
    SecurityEventService,
    EmailOtpService,
    EmailService,
    UserService,
    WebAuthnService,
    RedisService,
  ],
  exports: [MfaService], // Export for use in AuthService
})
export class MfaModule {}

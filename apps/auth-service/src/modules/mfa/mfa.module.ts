import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import {
  MfaSettings,
  SecurityEvent,
  Session,
  Tenant,
  TenantMfaPolicy,
  User,
  WebAuthnCredential,
} from "@repo/database";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { MfaPolicyService } from "./mfa-policy.service";
import { EmailOtpService } from "@/modules/mfa/email-otp.service";
import { EmailService } from "@/modules/email/email.service";
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
      TenantMfaPolicy,
    ]),
    JwtModule.register({}),
    ConfigModule,
    SecurityEventModule,
    EmailModule,
    UserModule,
  ],
  controllers: [MfaController],
  providers: [
    MfaService,
    MfaPolicyService,
    SecurityEventService,
    EmailOtpService,
    EmailService,
    WebAuthnService,
    RedisService,
  ],
  exports: [MfaService, MfaPolicyService],
})
export class MfaModule {}

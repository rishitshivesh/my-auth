import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  User,
  Tenant,
  TenantSocialProvider,
  OAuthClient,
  SecurityEvent,
  UserSocialConnection,
  WebAuthnCredential,
} from "@repo/database";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { TokenEncryptionService } from "@/modules/auth/oauth-token-encryption.service";
import { MfaModule } from "@/modules/mfa/mfa.module";
import { RedisService } from "@/common/service/redis.service";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      User,
      Tenant,
      TenantSocialProvider,
      OAuthClient,
      SecurityEvent,
      UserSocialConnection,
      WebAuthnCredential,
    ]),
    MfaModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, TokenEncryptionService],
})
export class DashboardModule {}

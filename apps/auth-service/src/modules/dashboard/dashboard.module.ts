import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  User,
  Session,
  Tenant,
  TenantSocialProvider,
  OAuthClient,
  SecurityEvent,
  UserSocialConnection,
  WebAuthnCredential,
} from "@repo/database";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { MfaModule } from "@/modules/mfa/mfa.module";
import { RedisService } from "@/common/service/redis.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
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
  providers: [DashboardService, RedisService],
})
export class DashboardModule {}

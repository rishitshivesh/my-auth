import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import {
  User,
  Session,
  Tenant,
  SecurityEvent,
  Role,
  UserRole,
  OAuthRefreshToken,
  KeyPair,
} from "@repo/database";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SuperadminSetupController } from "./superadmin-setup.controller";
import { RedisService } from "@/common/service/redis.service";
import { GuardsModule } from "@/common/guards/guards.module";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

import { TenantModule } from "@/modules/tenant/tenant.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      Tenant,
      SecurityEvent,
      Role,
      UserRole,
      OAuthRefreshToken,
      KeyPair,
    ]),
    JwtModule.register({}),
    GuardsModule,
    TenantModule,
  ],
  controllers: [AdminController, SuperadminSetupController],
  providers: [
    AdminService,
    RedisService,
    SessionService,
    JwksService,
    OAuthRefreshTokenService,
  ],
})
export class AdminModule {}

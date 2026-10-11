// apps/auth-service/src/modules/tenant/tenant.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import {
  Session,
  Tenant,
  TenantBranding,
  User,
  Role,
  UserRole,
  OAuthRefreshToken,
  KeyPair,
  Policy,
  RolePolicy,
} from "@repo/database";
import { TenantService } from "./tenant.service";
import { TenantController } from "./tenant.controller";
import { TenantBrandingController, PublicBrandingController } from "./tenant-branding.controller";
import { TenantBrandingService } from "./tenant-branding.service";
import { FileStorageService } from "./file-storage.service";
import { TenantRegistrationService } from "./tenant-registration.service";
import { TenantRegistrationController } from "./tenant-registration.controller";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { TenantSchemaService } from "@/core/tenant/tenant-schema.service";
import { RedisService } from "@/common/service/redis.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Session,
      TenantBranding,
      User,
      Role,
      UserRole,
      OAuthRefreshToken,
      KeyPair,
      Policy,
      RolePolicy,
    ]),
    JwtModule.register({}),
    SecurityEventModule,
    GuardsModule,
  ],
  providers: [
    TenantService,
    TenantBrandingService,
    FileStorageService,
    TenantSchemaService,
    TenantRegistrationService,
  ],
  controllers: [
    TenantController,
    TenantBrandingController,
    PublicBrandingController,
    TenantRegistrationController,
  ],
  exports: [TenantService, TenantBrandingService, TenantSchemaService],
})
export class TenantModule {}

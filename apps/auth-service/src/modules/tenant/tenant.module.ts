// apps/auth-service/src/modules/tenant/tenant.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { CacheModule } from "@nestjs/cache-manager";
import {
  Session,
  Tenant,
  TenantBranding,
  User,
  Role,
  UserRole,
  OAuthRefreshToken,
  KeyPair,
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
import { SessionRepository } from "@/core/database/session.repository";
import { TenantContextService } from "@/core/database/tenant-context.service";

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
      SessionRepository,
    ]),
    CacheModule.register({
      ttl: 300000,
      max: 1000,
    }),
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
    RedisService,
    SessionService,
    JwksService,
    OAuthRefreshTokenService,
    SessionRepository,
    TenantContextService,
  ],
  controllers: [
    TenantController,
    TenantBrandingController,
    PublicBrandingController,
    TenantRegistrationController,
  ],
  exports: [TenantService, TenantBrandingService, TenantSchemaService, TenantContextService, SessionRepository],
})
export class TenantModule {}

// apps/auth-service/src/modules/tenant/tenant.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "@nestjs/cache-manager";
import { Session, Tenant, TenantBranding } from "@repo/database";
import { TenantService } from "./tenant.service";
import { TenantController } from "./tenant.controller";
import { TenantBrandingController, PublicBrandingController } from "./tenant-branding.controller";
import { TenantBrandingService } from "./tenant-branding.service";
import { FileStorageService } from "./file-storage.service";
import { SecurityEventModule } from "@/common/service/security-event.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Session, TenantBranding]),
    CacheModule.register({
      ttl: 300000, // 5 minutes default
      max: 1000,
    }),
    SecurityEventModule,
  ],
  providers: [TenantService, TenantBrandingService, FileStorageService],
  controllers: [TenantController, TenantBrandingController, PublicBrandingController],
  exports: [TenantService, TenantBrandingService],
})
export class TenantModule {}

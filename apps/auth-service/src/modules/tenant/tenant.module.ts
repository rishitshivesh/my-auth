// apps/auth-service/src/modules/tenant/tenant.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "@nestjs/cache-manager";
import { Session, Tenant } from "@repo/database";
import { TenantService } from "./tenant.service";
import { TenantController } from "./tenant.controller";
import { TenantBrandingController } from "./tenant-branding.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Session]),
    CacheModule.register({
      ttl: 300000, // 5 minutes default
      max: 1000, // max items in cache
    }),
  ],
  providers: [TenantService],
  controllers: [TenantController, TenantBrandingController],
  exports: [TenantService],
})
export class TenantModule {}

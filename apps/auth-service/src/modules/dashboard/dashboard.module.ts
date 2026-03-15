import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Session, Tenant, TenantSocialProvider } from "@repo/database";
import { DashboardController } from "./dashboard.controller";
import { MfaModule } from "@/modules/mfa/mfa.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Tenant, TenantSocialProvider]),
    MfaModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}

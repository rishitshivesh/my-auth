import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TenantPasswordPolicy } from "@repo/database";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { GuardsModule } from "@/common/guards/guards.module";
import { TenantPasswordPolicyService } from "./tenant-password-policy.service";
import { TenantPasswordPolicyController } from "./tenant-password-policy.controller";

@Module({
  imports: [TypeOrmModule.forFeature([TenantPasswordPolicy]), SecurityEventModule, GuardsModule],
  providers: [TenantPasswordPolicyService],
  controllers: [TenantPasswordPolicyController],
  exports: [TenantPasswordPolicyService],
})
export class PasswordPolicyModule {}

import { Module } from "@nestjs/common";
import { UserModule } from "@/modules/user/user.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { TenantModule } from "@/modules/tenant/tenant.module";

@Module({
  imports: [UserModule, AuthModule, TenantModule],
})
export class CombinedModules {}

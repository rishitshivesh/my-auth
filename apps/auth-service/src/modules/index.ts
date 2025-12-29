import { Module } from "@nestjs/common";
import { UserModule } from "@/modules/user/user.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { TenantModule } from "@/modules/tenant/tenant.module";
import { OAuthModule } from "@/modules/oauth/oauth.module";
import { RbacModule } from "@/modules/rbac/rbac.module";
import { MfaModule } from "@/modules/mfa/mfa.module";

@Module({
  imports: [
    UserModule,
    AuthModule,
    TenantModule,
    OAuthModule,
    RbacModule,
    MfaModule,
  ],
})
export class CombinedModules {}

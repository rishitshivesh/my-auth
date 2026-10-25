import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SamlServiceProvider, KeyPair, User } from "@repo/database";
import { SamlService } from "./saml.service";
import { SamlController } from "./saml.controller";
import { GuardsModule } from "@/common/guards/guards.module";
import { TenantModule } from "@/modules/tenant/tenant.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SamlServiceProvider, KeyPair, User]),
    GuardsModule,
    TenantModule,
    // RequestUserGuard (used by SamlController) needs JwtService; JwksService is provided globally.
    JwtModule.register({}),
  ],
  controllers: [SamlController],
  providers: [SamlService],
  exports: [SamlService],
})
export class SamlModule {}

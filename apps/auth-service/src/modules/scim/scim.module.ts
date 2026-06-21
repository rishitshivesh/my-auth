import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Group, UserGroup, ScimToken } from "@repo/database";
import { ScimService } from "./scim.service";
import { ScimTokenService } from "./scim-token.service";
import { ScimController } from "./scim.controller";
import { ScimAuthGuard } from "./scim.guard";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Group, UserGroup, ScimToken]),
    GuardsModule,
  ],
  controllers: [ScimController],
  providers: [ScimService, ScimTokenService, ScimAuthGuard],
  exports: [ScimService, ScimTokenService],
})
export class ScimModule {}

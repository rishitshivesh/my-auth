import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SamlServiceProvider, KeyPair } from "@repo/database";
import { SamlService } from "./saml.service";
import { SamlController } from "./saml.controller";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SamlServiceProvider, KeyPair]),
    GuardsModule,
  ],
  controllers: [SamlController],
  providers: [SamlService],
  exports: [SamlService],
})
export class SamlModule {}

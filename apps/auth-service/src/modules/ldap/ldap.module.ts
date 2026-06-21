import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LdapConnection, User } from "@repo/database";
import { LdapService } from "./ldap.service";
import { LdapController } from "./ldap.controller";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([LdapConnection, User]),
    GuardsModule,
  ],
  controllers: [LdapController],
  providers: [LdapService],
  exports: [LdapService],
})
export class LdapModule {}

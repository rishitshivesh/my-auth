import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OAuthRefreshToken } from "@repo/database";
import { SessionController } from "./session.controller";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  imports: [DatabaseModule, TypeOrmModule.forFeature([OAuthRefreshToken])],
  controllers: [SessionController],
  providers: [SessionManagementService, OAuthRefreshTokenService],
  exports: [SessionManagementService],
})
export class SessionModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Session, OAuthRefreshToken } from "@repo/database";
import { SessionController } from "./session.controller";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

@Module({
  imports: [TypeOrmModule.forFeature([Session, OAuthRefreshToken])],
  controllers: [SessionController],
  providers: [SessionManagementService, OAuthRefreshTokenService],
  exports: [SessionManagementService],
})
export class SessionModule {}

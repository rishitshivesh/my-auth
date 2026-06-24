import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OAuthRefreshToken } from "@repo/database";
import { SessionController } from "./session.controller";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { RefreshTokenRepository } from "@/modules/oauth/repositories/refresh-token.repository";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  // TypeOrmModule.forFeature([OAuthRefreshToken]) kept for OAuthRefreshTokenService which still
  // uses @InjectRepository(OAuthRefreshToken) for raw-SQL operations (complex joins/rotation).
  // RefreshTokenRepository (TenantAwareRepository) handles all TypeORM-expressed queries.
  imports: [DatabaseModule, TypeOrmModule.forFeature([OAuthRefreshToken])],
  controllers: [SessionController],
  providers: [SessionManagementService, OAuthRefreshTokenService, RefreshTokenRepository],
  exports: [SessionManagementService],
})
export class SessionModule {}

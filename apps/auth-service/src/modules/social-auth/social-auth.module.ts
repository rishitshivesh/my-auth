import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  User,
  UserSocialConnection,
  TenantSocialProvider,
  SocialLinkRequest,
  Session,
  OAuthRefreshToken,
  UserRole,
} from "@repo/database";
import { SocialAuthController } from "./social-auth.controller";
import { SocialAuthService } from "./social-auth.service";
import { GoogleStrategy } from "./strategies/google.strategy";
import { GitHubStrategy } from "./strategies/github.strategy";
import { MicrosoftStrategy } from "./strategies/microsoft.strategy";
import { TokenEncryptionService } from "@/modules/auth/oauth-token-encryption.service";
import { SessionService } from "@/common/service/session.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";
import { OAuthModule } from "@/modules/oauth/oauth.module";
import { MfaModule } from "@/modules/mfa/mfa.module";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSocialConnection,
      TenantSocialProvider,
      SocialLinkRequest,
      Session,
      OAuthRefreshToken,
      UserRole,
    ]),
    SecurityEventModule,
    OAuthModule,
    MfaModule,
    DatabaseModule,
    JwtModule.register({}),
  ],
  controllers: [SocialAuthController],
  providers: [
    SocialAuthService,
    SecurityEventService,
    GoogleStrategy,
    GitHubStrategy,
    MicrosoftStrategy,
    TokenEncryptionService,
    SessionService,
    OAuthRefreshTokenService,
  ],
  exports: [SocialAuthService],
})
export class SocialAuthModule {}

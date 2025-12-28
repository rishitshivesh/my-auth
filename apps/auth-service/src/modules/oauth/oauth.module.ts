import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import {
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthRefreshToken,
  OAuthConsent,
  User,
} from "@repo/database";
import { PasswordService } from "@repo/security";
import { OAuthController } from "./oauth.controller";
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import { OAuthConsentService } from "./services/oauth-consent.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthAuthorizationCode,
      OAuthAccessToken,
      OAuthRefreshToken,
      OAuthConsent,
      User,
    ]),
    JwtModule.register({}), // Config provided in service
  ],
  controllers: [OAuthController],
  providers: [
    OAuthClientService,
    OAuthTokenService,
    OAuthConsentService,
    PasswordService,
  ],
  exports: [OAuthClientService, OAuthTokenService, OAuthConsentService],
})
export class OAuthModule {}

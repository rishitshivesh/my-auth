import { WellKnownController } from "./well-known.controller";
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
  Role,
  Permission,
  UserRole,
  KeyPair,
} from "@repo/database";
import { PasswordService } from "@repo/security";
import { OAuthController } from "./oauth.controller";
import { OAuthAuthorizeController } from "./oauth-authorize.controller";
import { OAuthBrowserSessionService } from "./services/oauth-browser-session.service";
import { OAuthConsentTransactionService } from "./services/oauth-consent-transaction.service";
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import { OAuthConsentService } from "./services/oauth-consent.service";
import { JwksService } from "./services/jwks.service";
import { KeyRotationService } from "./services/key-rotation.service";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RbacModule } from "@/modules/rbac/rbac.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthAuthorizationCode,
      OAuthAccessToken,
      OAuthRefreshToken,
      OAuthConsent,
      User,
      Role,
      Permission,
      UserRole,
      KeyPair,
    ]),
    JwtModule.register({}), // Config provided in service
    RbacModule,
  ],
  controllers: [OAuthController, OAuthAuthorizeController, WellKnownController],
  providers: [
    OAuthClientService,
    OAuthTokenService,
    OAuthConsentService,
    OAuthBrowserSessionService,
    OAuthConsentTransactionService,
    PasswordService,
    KeyRotationService,
  ],
  exports: [OAuthClientService, OAuthTokenService, OAuthConsentService],
})
export class OAuthModule {}

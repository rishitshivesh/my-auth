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
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import { OAuthConsentService } from "./services/oauth-consent.service";
import { JwksService } from "./services/jwks.service";
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
  controllers: [OAuthController, WellKnownController],
  providers: [
    OAuthClientService,
    OAuthTokenService,
    OAuthConsentService,
    PasswordService,
  ],
  exports: [OAuthClientService, OAuthTokenService, OAuthConsentService],
})
export class OAuthModule {}

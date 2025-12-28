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
} from "@repo/database";
import { PasswordService } from "@repo/security";
import { OAuthController } from "./oauth.controller";
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import { OAuthConsentService } from "./services/oauth-consent.service";
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
    ]),
    JwtModule.register({}), // Config provided in service
    RbacModule,
  ],
  controllers: [OAuthController],
  providers: [
    OAuthClientService,
    OAuthTokenService,
    OAuthConsentService,
    PasswordService,
    RbacService,
  ],
  exports: [OAuthClientService, OAuthTokenService, OAuthConsentService],
})
export class OAuthModule {}

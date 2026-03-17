import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  User,
  Session,
  Tenant,
  MfaSettings,
  WebAuthnCredential,
  OAuthRefreshToken,
  UserRole,
  UserSocialConnection,
  TenantSocialProvider,
  SecurityEvent,
} from "@repo/database";
import { UserModule } from "../user/user.module";
import { EmailModule } from "../email/email.module";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PasswordService } from "@repo/security";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "@/common/guards/jwt.strategy";
import { JwtAuthGuard } from "@/common/guards";
import { SessionService } from "@/common/service/session.service";
import { RedisService } from "@/common/service/redis.service";
import { BruteForceService } from "@/modules/auth/brute-force.service";
import { MfaService } from "@/modules/mfa/mfa.service";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";
import { GuardsModule } from "@/common/guards/guards.module";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { ScheduleModule } from "@nestjs/schedule";
import { TokenCleanupService } from "@/modules/auth/token-cleanup.service";
import { SessionModule } from "@/modules/session/session.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      Tenant,
      MfaSettings,
      WebAuthnCredential,
      OAuthRefreshToken,
      UserRole,
      UserSocialConnection,
      TenantSocialProvider,
      SecurityEvent,
    ]),
    SecurityEventModule,
    UserModule,
    EmailModule,
    GuardsModule,
    SessionModule,
    ScheduleModule.forRoot(),
    PassportModule.register(JwtStrategy),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET"),
        signOptions: {
          expiresIn: "15m", // Access token expires in 15 minutes
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SecurityEventService,
    PasswordService,
    JwtStrategy,
    JwtAuthGuard,
    SessionService,
    RedisService,
    BruteForceService,
    MfaService,
    WebAuthnService,
    RbacService,
    OAuthRefreshTokenService,
    TokenCleanupService,
  ],
  exports: [AuthService, OAuthRefreshTokenService],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  User,
  Session,
  SecurityEvent,
  Tenant,
  MfaSettings,
} from "@repo/database";
import { UserModule } from "../user/user.module";
import { EmailModule } from "../email/email.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PasswordService } from "@repo/security";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      SecurityEvent,
      Tenant,
      MfaSettings,
    ]),
    UserModule,
    EmailModule,
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
  providers: [AuthService, PasswordService],
  exports: [AuthService],
})
export class AuthModule {}

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

/**
 * JWT Strategy
 *
 * Validates JWT tokens and extracts user payload
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    // @ts-ignore
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET"),
    });
  }

  async validate(payload: any) {
    if (!payload.sub) {
      throw new UnauthorizedException("Invalid token payload");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
    };
  }
}

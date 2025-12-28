import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { SessionService } from "@/common/service/session.service";

/**
 * JWT Strategy
 *
 * Validates JWT tokens and extracts user payload
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow("JWT_SECRET"),
    });
  }

  async validate(payload: any) {
    // if (!payload.sub) {
    //   throw new UnauthorizedException("Invalid token payload");
    // }
    //
    // return {
    //   sub: payload.sub,
    //   email: payload.email,
    //   tenantId: payload.tenantId,
    // };

    const session = await this.sessionService.validateSession(
      payload.tenantId,
      payload.sessionId,
    );

    if (!session) {
      throw new UnauthorizedException("Session invalid or expired");
    }

    // Verify tenant matches
    if (session.tenantId !== payload.tenantId) {
      throw new UnauthorizedException("Tenant mismatch");
    }

    // Verify user matches
    if (session.userId !== payload.sub) {
      throw new UnauthorizedException("User mismatch");
    }

    // Return user context
    return {
      sub: payload.sub,
      userId: session.userId,
      email: session.email,
      tenantId: session.tenantId,
      sessionId: session.id,
    };
  }
}

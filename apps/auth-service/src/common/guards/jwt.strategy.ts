import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/**
 * Cookie extractor for browser clients
 */
const cookieExtractor = (req: Request): string | null => {
  if (req && req.cookies) {
    return req.cookies["access_token"] || null;
  }
  return null;
};

/**
 * JWT Strategy - ONLY validates token signature and expiry
 *
 * Does NOT validate:
 * - Session (SessionGuard does this)
 * - Tenant (TenantBindingGuard does this)
 * - Permissions (PermissionsGuard does this)
 *
 * Supports:
 * - Bearer token (Authorization: Bearer <token>)
 * - HttpOnly cookie (access_token)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(), // Bearer token first
        cookieExtractor, // Cookie fallback
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow("JWT_SECRET"),
    });
  }

  /**
   * Validate JWT payload
   *
   * This runs AFTER signature verification
   * ONLY checks payload structure, NOT business logic
   */
  async validate(payload: any) {
    // Basic payload validation
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException("Invalid token payload");
    }

    // Return payload to be attached to request.user
    // Other guards will do additional validation
    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}

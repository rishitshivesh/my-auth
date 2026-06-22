import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { JwksService } from "../../modules/oauth/services/jwks.service";
import * as crypto from "crypto";

const cookieExtractor = (req: Request): string | null => {
  if (req && req.cookies) {
    // Cookie name matches what setAuthCookies() sets: 'accessToken'
    return req.cookies["accessToken"] || null;
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly jwksService: JwksService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      algorithms: ["RS256"],
      secretOrKeyProvider: async (
        _request: Request,
        rawJwtToken: string,
        done: (err: Error | null, key?: string | Buffer) => void,
      ) => {
        try {
          const parts = rawJwtToken.split(".");
          if (parts.length !== 3) {
            return done(new Error("Invalid token format"));
          }
          const header = JSON.parse(
            Buffer.from(parts[0]!, "base64url").toString(),
          );
          const kid = header?.kid as string | undefined;
          if (!kid) {
            return done(new Error("Token missing kid header"));
          }

          const jwk = await jwksService.getVerificationKeyByKid(kid);
          if (!jwk) {
            return done(new Error("Signing key not found in JWKS"));
          }

          const publicKey = crypto.createPublicKey({
            key: jwk as unknown as crypto.JsonWebKey,
            format: "jwk",
          });

          const pem = publicKey.export({ format: "pem", type: "spki" });
          done(null, pem as string | Buffer);
        } catch (err) {
          done(err as Error);
        }
      },
    });
  }

  async validate(payload: Record<string, unknown>) {
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new UnauthorizedException("Invalid token payload");
    }

    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
    const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];

    const platformSlug = process.env.SENTRY_PLATFORM_SLUG ?? "sentry";
    const platformRole = `${platformSlug}-internal`;
    const isSuperAdmin =
      groups.includes(platformRole) ||
      roles.includes(platformRole) ||
      groups.includes("sentry-internal") ||
      roles.includes("sentry-internal") ||
      groups.includes("super_admin") ||
      roles.includes("super_admin");

    return {
      sub: payload.sub,
      userId: payload.sub,
      tenantId: payload.tenantId as string | undefined,
      tenantSlug: payload.tenantSlug as string | undefined,
      sessionId: payload.sessionId as string | undefined,
      email: payload.email as string | undefined,
      roles,
      groups,
      isSuperAdmin: !!isSuperAdmin,
    };
  }
}

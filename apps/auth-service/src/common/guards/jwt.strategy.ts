import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { JwksService } from "../../modules/oauth/services/jwks.service";
import * as crypto from "crypto";

const cookieExtractor = (req: Request): string | null => {
  if (req && req.cookies) {
    return req.cookies["auth_token"] || null;
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
            key: jwk as any,
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

  async validate(payload: any) {
    if (!payload.sub) {
      throw new UnauthorizedException("Invalid token payload");
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      roles: payload.roles || [],
      groups: payload.groups || [],
    };
  }
}

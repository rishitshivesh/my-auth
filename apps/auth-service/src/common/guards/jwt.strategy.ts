import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { Request } from "express";
import * as crypto from "crypto";

const cookieExtractor = (req: Request): string | null => {
  if (req && req.cookies) {
    return req.cookies["access_token"] || null;
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
        _rawJwtToken: string,
        done: (err: Error | null, key?: string | Buffer) => void,
      ) => {
        try {
          const { privateKey } = await jwksService.getCurrentSigningKey();
          const publicKey = crypto.createPublicKey(privateKey);
          const pem = publicKey.export({ type: "spki", format: "pem" });
          done(null, pem as string);
        } catch (err) {
          done(err as Error);
        }
      },
    });
  }

  async validate(payload: Record<string, unknown>) {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException("Invalid token payload");
    }

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

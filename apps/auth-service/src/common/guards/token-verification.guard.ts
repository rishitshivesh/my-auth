import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { logger } from "../logger";

/**
 * Purpose-bound tokens (mfa_pending, social_completion, link, ...) share the
 * RS256 signing key with access tokens. Only a real session access token
 * (no purpose claim, carries a sessionId) may establish request.user.
 */
function isSessionAccessToken(payload: Record<string, unknown>): boolean {
  return (
    payload.type === undefined &&
    payload.mode === undefined &&
    payload.purpose === undefined &&
    typeof payload.sub === "string" &&
    typeof payload.sessionId === "string"
  );
}

@Injectable()
export class TokenVerificationGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwksService: JwksService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies.accessToken ??
      request.headers["x-authorization"] ??
      request.headers["authorization"];

    if (!token) {
      return false;
    }

    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      const decoded = this.jwtService.verify(token, {
        publicKey: publicKey as any,
        algorithms: ["RS256"],
      });
      if (!decoded || !isSessionAccessToken(decoded)) {
        return false;
      }
      request.user = decoded;
      return true;
    } catch {
      return false;
    }
  }
}

@Injectable()
export class RequestUserGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwksService: JwksService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies.accessToken ??
      request.headers["x-authorization"] ??
      request.headers["authorization"];

    try {
      if (token) {
        const publicKey = await this.jwksService.getPublicKeyForToken(token);
        const decoded = this.jwtService.verify(token, {
          publicKey: publicKey as any,
          algorithms: ["RS256"],
        });
        if (decoded && isSessionAccessToken(decoded)) request.user = decoded;
      }
      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to verify token");
      return true;
    }
  }
}

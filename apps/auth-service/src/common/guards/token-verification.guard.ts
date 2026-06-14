import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { logger } from "../logger";
import * as crypto from "crypto";

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
      const { privateKey } = await this.jwksService.getCurrentSigningKey();
      const publicKey = crypto.createPublicKey(privateKey);
      const decoded = this.jwtService.verify(token, {
        publicKey,
        algorithms: ["RS256"],
      });
      if (!decoded) {
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
        const { privateKey } = await this.jwksService.getCurrentSigningKey();
        const publicKey = crypto.createPublicKey(privateKey);
        const decoded = this.jwtService.verify(token, {
          publicKey,
          algorithms: ["RS256"],
        });
        if (decoded) request.user = decoded;
      }
      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to verify token");
      return true;
    }
  }
}

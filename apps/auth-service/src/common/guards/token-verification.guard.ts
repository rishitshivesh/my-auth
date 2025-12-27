import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { logger } from '../logger';

@Injectable()
export class TokenVerificationGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies.accessToken ??
      request.headers['x-authorization'] ??
      request.headers['authorization'];

    if (!token) {
      return false;
    }

    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      if (!decoded) {
        return false;
      }
      request.user = decoded;
      return true;
    } catch (error) {
      return false;
    }
  }
}

@Injectable()
/**
 * Add Request User to the request object if present.
 * This guard is used to check if the user is authenticated.
 * If the user is authenticated, the user object is added to the request object.
 * If the user is not authenticated, the request object is not modified.
 * This will NOT block or PROTECT the route.
 *
 * If Protection is required, please use one of the above two Guards.
 */
export class RequestUserGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies.accessToken ??
      request.headers['x-authorization'] ??
      request.headers['authorization'];

    try {
      if (token) {
        const decoded = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET,
        });
        if (decoded) request.user = decoded;
      }
      return true;
    } catch (error) {
      logger.error({
        message: 'Failed to verify token',
        error,
      });
      return true;
    }
  }
}

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

/**
 * JWT Authentication Guard
 *
 * Protects routes by validating JWT tokens
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException("Invalid or expired token");
    }

    const req = context.switchToHttp().getRequest();

    // 1️⃣ Tenant binding
    const tokenTenant = user.tenantId;
    const requestTenant = req.tenant?.id;

    if (!tokenTenant || !requestTenant) {
      throw new UnauthorizedException("Tenant missing");
    }

    if (tokenTenant !== requestTenant) {
      throw new UnauthorizedException("Cross-tenant token");
    }

    return user;
  }
}

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

interface AuthenticatedUser {
  userId: string;
  // These fields come from JWT payload claims and may be absent on malformed tokens.
  // The guard validates their presence before allowing the request through.
  tenantId: string | undefined;
  tenantSlug: string | undefined;
  email: string | undefined;
  roles: string[];
  groups: string[];
  isSuperAdmin: boolean;
}

/**
 * JWT Authentication Guard
 *
 * Protects routes by validating JWT tokens
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = any>(err: unknown, user: unknown, info: unknown, context: ExecutionContext, status?: unknown): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException("Invalid or expired token");
    }

    const req = context.switchToHttp().getRequest();
    const authedUser = user as AuthenticatedUser;

    // 1️⃣ Tenant binding
    const tokenTenant = authedUser.tenantId;
    const requestTenant = req.tenant?.id;

    if (!tokenTenant || !requestTenant) {
      throw new UnauthorizedException("Tenant missing");
    }

    if (tokenTenant !== requestTenant) {
      throw new UnauthorizedException("Cross-tenant token");
    }

    return authedUser as unknown as TUser;
  }
}

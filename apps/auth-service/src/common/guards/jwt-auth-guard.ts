import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiException } from "../http";

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
  /** Epoch seconds of the login this session started with. */
  authTime: number | undefined;
}

function isExpiredInfo(info: unknown): boolean {
  return info instanceof Error && info.name === "TokenExpiredError";
}

/**
 * JWT Authentication Guard
 *
 * Protects routes by validating JWT tokens
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = AuthenticatedUser>(err: unknown, user: unknown, info: unknown, context: ExecutionContext, status?: unknown): TUser {
    if (err || !user) {
      if (err) throw err;
      throw new ApiException(
        isExpiredInfo(info) ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID",
      );
    }

    const req = context.switchToHttp().getRequest();
    const authedUser = user as AuthenticatedUser;

    // 1️⃣ Tenant binding
    const tokenTenant = authedUser.tenantId;
    const requestTenant = req.tenant?.id;

    if (!tokenTenant || !requestTenant) {
      throw new ApiException("TENANT_MISMATCH", { detail: "Tenant context is missing." });
    }

    if (tokenTenant !== requestTenant) {
      throw new ApiException("TENANT_MISMATCH", {
        detail: "This session belongs to a different tenant.",
      });
    }

    return authedUser as unknown as TUser;
  }
}

import { Injectable, CanActivate, ExecutionContext, Logger } from "@nestjs/common";
import { ApiException } from "../http";

/**
 * TenantBindingGuard
 *
 * Enforces that the tenant in the JWT token matches the tenant resolved from the request.
 * This prevents token reuse across tenants (critical for multi-tenant security).
 *
 * MUST run AFTER:
 * - TenantResolverMiddleware (sets req.tenantId)
 * - JwtAuthGuard (validates JWT and sets req.user)
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, TenantBindingGuard)
 */
@Injectable()
export class TenantBindingGuard implements CanActivate {
  private readonly logger = new Logger(TenantBindingGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Step 1: Verify prerequisites
    const requestTenantId = request.tenantId;
    const user = request.user;

    if (!requestTenantId) {
      // This means TenantResolverMiddleware didn't run or failed
      this.logger.error("TenantBindingGuard: No tenantId on request");
      throw new ApiException("ACCESS_FORBIDDEN", { detail: "Tenant context not found. This route requires tenant resolution." });
    }

    if (!user) {
      // This means JwtAuthGuard didn't run or token is invalid
      this.logger.error("TenantBindingGuard: No user on request");
      throw new ApiException("AUTH_TOKEN_INVALID", { detail: "Authentication required" });
    }

    // Step 2: Extract tenant from token payload
    const tokenTenantId = user.tenantId;

    if (!tokenTenantId) {
      // Token doesn't have tenantId (shouldn't happen with proper token generation)
      this.logger.error("TenantBindingGuard: Token missing tenantId", {
        userId: user.sub,
        email: user.email,
      });
      throw new ApiException("TENANT_MISMATCH", { detail: "Invalid token: missing tenant context" });
    }

    // Step 3: Enforce tenant binding
    if (user.isSuperAdmin) {
      this.logger.debug(`Tenant binding bypassed for superadmin: ${user.email}`);
      return true;
    }

    if (tokenTenantId !== requestTenantId) {
      this.logger.warn("Tenant binding violation detected", {
        userId: user.sub,
        email: user.email,
        tokenTenant: tokenTenantId,
        requestTenant: requestTenantId,
        ip: request.ip,
        path: request.path,
      });

      throw new ApiException("TENANT_MISMATCH", { detail: "Token is not valid for this tenant. Please authenticate with the correct tenant." });
    }

    // Step 4: Success - tenant binding is valid
    this.logger.debug("Tenant binding verified", {
      userId: user.sub,
      tenantId: tokenTenantId,
      path: request.path,
    });

    return true;
  }
}

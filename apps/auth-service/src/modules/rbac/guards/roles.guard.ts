// apps/auth-service/src/modules/rbac/guards/roles.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RbacService } from "../services/rbac.service";

export const ROLES_KEY = "roles";

/**
 * Guard to check if user has required roles
 *
 * Usage:
 * @RequireRoles('admin', 'developer')
 * @UseGuards(RolesGuard)
 * async manageSettings() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get request and user
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From JwtGuard
    const tenantId = request.tenantId; // From TenantMiddleware

    if (!user || !user.sub) {
      throw new ForbiddenException("User not authenticated");
    }

    if (!tenantId) {
      throw new ForbiddenException("Tenant context not found");
    }

    // Check if user has ANY of the required roles
    const hasRole = await this.rbacService.userHasAnyRole(
      user.sub,
      tenantId,
      requiredRoles,
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Missing required role. Required one of: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}

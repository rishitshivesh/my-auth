// apps/auth-service/src/modules/rbac/guards/permissions.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RbacService } from "../services/rbac.service";

export const PERMISSIONS_KEY = "permissions";

/**
 * Guard to check if user has required permissions
 *
 * Usage:
 * @RequirePermissions('users:write', 'users:delete')
 * @UseGuards(PermissionsGuard)
 * async deleteUser() { ... }
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
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

    // Check if user has ALL required permissions
    const hasPermissions = await this.rbacService.userHasAllPermissions(
      user.sub,
      tenantId,
      requiredPermissions,
    );

    if (!hasPermissions) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(", ")}`,
      );
    }

    return true;
  }
}

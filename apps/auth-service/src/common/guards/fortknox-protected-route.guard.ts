// apps/auth-service/src/common/guards/fortknox-protected.guard.ts

import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantBindingGuard } from "./tenant-binding.guard";
import { JwtAuthGuard } from "@/common/guards/jwt-auth-guard";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { SessionGuard } from "@/common/guards/session.guard";

/**
 * FortKnoxProtectedGuard
 *
 * Composite guard that enforces complete auth boundary:
 * 1. JWT validation (token is valid)
 * 2. Tenant binding (token tenant == request tenant)
 * 3. Session validity (session exists, not revoked, not expired)
 * 4. Permissions (optional, only if @RequirePermissions decorator present)
 *
 * This is the "one guard to rule them all" approach.
 *
 * Usage:
 * @UseGuards(FortKnoxProtectedGuard)
 * @RequirePermissions('users:read') // Optional
 * async myProtectedRoute() { ... }
 *
 * Benefits:
 * - Single decorator
 * - Guaranteed correct order
 * - Easier to maintain
 * - Less error-prone
 */
@Injectable()
export class FortKnoxProtectedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly tenantBindingGuard: TenantBindingGuard,
    private readonly sessionGuard: SessionGuard,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: JWT Authentication
    const jwtResult = await this.jwtAuthGuard.canActivate(context);
    if (!jwtResult) {
      return false;
    }

    // Step 2: Tenant Binding
    const tenantResult = this.tenantBindingGuard.canActivate(context);
    if (!tenantResult) {
      return false;
    }

    // Step 3: Session Validation
    const sessionResult = await this.sessionGuard.canActivate(context);
    if (!sessionResult) {
      return false;
    }

    // Step 4: Permissions (only if decorator present)
    const permissions = this.reflector.get<string[]>(
      "permissions",
      context.getHandler(),
    );

    if (permissions && permissions.length > 0) {
      const permissionsResult =
        await this.permissionsGuard.canActivate(context);
      if (!permissionsResult) {
        return false;
      }
    }

    return true;
  }
}

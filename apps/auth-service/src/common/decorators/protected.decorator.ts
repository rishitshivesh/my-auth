import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth } from "@nestjs/swagger";
import { TenantBindingGuard } from "../guards/tenant-binding.guard";
import { SessionGuard } from "../guards/session.guard";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import {
  RequirePermissions,
  RequireRoles,
} from "@/modules/rbac/decorators/rbac.decorator";
import { RolesGuard } from "@/modules/rbac/guards/roles.guard";

/**
 * Standard protection for authenticated routes
 *
 * Applies in order:
 * 1. JwtAuthGuard - validates JWT signature
 * 2. TenantBindingGuard - ensures token tenant == request tenant
 * 3. SessionGuard - validates session active
 *
 * Usage:
 * @Protected()
 * @Get('profile')
 * async getProfile(@Req() req) { ... }
 */
export function Protected() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, TenantBindingGuard, SessionGuard),
    ApiBearerAuth(),
    ApiCookieAuth(),
  );
}

/**
 * Protected with permissions check
 *
 * Usage:
 * @ProtectedWithPermissions('users:read', 'users:write')
 * @Get('users')
 * async listUsers() { ... }
 */
export function ProtectedWithPermissions(...permissions: string[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, TenantBindingGuard, SessionGuard, PermissionsGuard),
    RequirePermissions(...permissions),
    ApiBearerAuth(),
    ApiCookieAuth(),
  );
}

/**
 * Protected with roles check
 *
 * Usage:
 * @ProtectedWithRoles('admin', 'owner')
 * @Delete('users/:id')
 * async deleteUser() { ... }
 */
export function ProtectedWithRoles(...roles: string[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, TenantBindingGuard, SessionGuard, RolesGuard),
    RequireRoles(...roles),
    ApiBearerAuth(),
    ApiCookieAuth(),
  );
}

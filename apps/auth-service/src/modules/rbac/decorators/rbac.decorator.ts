// apps/auth-service/src/modules/rbac/decorators/rbac.decorators.ts

import { SetMetadata } from "@nestjs/common";
import { PERMISSIONS_KEY } from "../guards/permissions.guard";
import { ROLES_KEY } from "../guards/roles.guard";

/**
 * Decorator to require specific permissions
 *
 * @example
 * @RequirePermissions('users:write', 'users:delete')
 * @UseGuards(JwtGuard, PermissionsGuard)
 * async deleteUser() { ... }
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to require specific roles
 *
 * @example
 * @RequireRoles('admin', 'developer')
 * @UseGuards(JwtGuard, RolesGuard)
 * async manageSettings() { ... }
 */
export const RequireRoles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to require admin role
 *
 * @example
 * @RequireAdmin()
 * @UseGuards(JwtGuard, RolesGuard)
 * async deleteAll() { ... }
 */
export const RequireAdmin = () =>
  SetMetadata(ROLES_KEY, ["admin", "super_admin"]);

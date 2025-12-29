// apps/auth-service/src/modules/rbac/guards/permissions.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RbacService } from "../services/rbac.service";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "@repo/database";
import { Repository } from "typeorm";

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
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;

    // Fetch user permissions (TENANT-SCOPED)
    const userWithPermissions = await this.userRepository.findOne({
      where: { id: user.sub, tenantId }, // ✅ ALWAYS tenant-scoped
      relations: [
        "userRoles",
        "userRoles.role",
        "userRoles.role.rolePermissions",
        "userRoles.role.rolePermissions.permission",
      ],
    });

    if (!userWithPermissions) {
      throw new ForbiddenException("User not found");
    }

    // Extract user's permissions
    const userPermissions = new Set<string>();
    for (const userRole of userWithPermissions.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        userPermissions.add(rolePermission.permission.name);
      }
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(", ")}`,
      );
    }

    return true;
  }
}

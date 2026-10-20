import { Injectable } from "@nestjs/common";
import { ApiException, isConflict } from "../../../common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { User, Role, Permission, UserRole } from "@repo/database";
import { RoleService } from "./role.service";
import { PermissionService } from "./permission.service";
import { logger } from "@/common/logger";
import {
  canManage,
  isOwnerLevel,
  maxPriority,
} from "../role-hierarchy";

export interface AssignRoleDto {
  userId: string;
  roleId: string;
  tenantId: string;
  assignedBy?: string;
  expiresAt?: Date;
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AssignRolesByNameDto {
  userId: string;
  roleNames: string[];
  tenantId: string;
  assignedBy?: string;
  expiresAt?: Date;
  reason?: string;
}

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    private roleService: RoleService,
    private permissionService: PermissionService,
  ) {}

  // ============================================================
  // USER-ROLE ASSIGNMENTS
  // ============================================================

  /**
   * Assign role to user
   */
  async assignRole(data: AssignRoleDto): Promise<UserRole> {
    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: data.userId, tenantId: data.tenantId },
    });

    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    // Verify role exists
    const role = await this.roleService.getRole(data.roleId, data.tenantId);

    if (data.assignedBy) {
      await this.assertActorCanManage(
        data.assignedBy,
        data.userId,
        data.tenantId,
        [role.priority],
      );
    }

    // Check if already assigned
    const existing = await this.userRoleRepository.findOne({
      where: {
        userId: data.userId,
        roleId: data.roleId,
        tenantId: data.tenantId,
      },
    });

    if (existing) {
      // Update expiry if provided
      if (data.expiresAt) {
        existing.expiresAt = data.expiresAt;
        existing.reason = data.reason;
        existing.metadata = data.metadata;
        await this.userRoleRepository.save(existing);
        logger.info({ roleName: role.name, userEmail: user.email }, "Updated role assignment");
        return existing;
      }

      throw new ApiException("RESOURCE_CONFLICT", { detail: "Role already assigned to user" });
    }

    // Create assignment
    const userRole = await this.userRoleRepository.save({
      tenantId: data.tenantId,
      userId: data.userId,
      roleId: data.roleId,
      assignedBy: data.assignedBy,
      assignedAt: new Date(),
      expiresAt: data.expiresAt,
      reason: data.reason,
      metadata: data.metadata,
    });

    logger.info({ roleName: role.name, userEmail: user.email }, "Assigned role to user");

    return userRole;
  }

  /**
   * Assign multiple roles to user by role names
   */
  async assignRolesByNames(data: AssignRolesByNameDto): Promise<UserRole[]> {
    // Get roles by names
    const roles = await this.roleService.listRoles(data.tenantId);
    const roleMap = new Map(roles.map((r) => [r.name, r]));

    const assignments: UserRole[] = [];

    for (const roleName of data.roleNames) {
      const role = roleMap.get(roleName);
      if (!role) {
        throw new ApiException("RESOURCE_NOT_FOUND");
      }

      try {
        const userRole = await this.assignRole({
          userId: data.userId,
          roleId: role.id,
          tenantId: data.tenantId,
          assignedBy: data.assignedBy,
          expiresAt: data.expiresAt,
          reason: data.reason,
        });
        assignments.push(userRole);
      } catch (error) {
        // Skip if already assigned
        if (!(error instanceof ApiException && error.code === "RESOURCE_CONFLICT")) {
          throw error;
        }
      }
    }

    return assignments;
  }

  /**
   * Remove role from user
   */
  async removeRole(
    userId: string,
    roleId: string,
    tenantId: string,
    actorId?: string,
  ): Promise<void> {
    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId, tenantId },
      relations: ["role"],
    });

    if (!userRole) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    if (actorId) {
      await this.assertActorCanManage(actorId, userId, tenantId, [
        userRole.role?.priority ?? 0,
      ]);
    }
    if (isOwnerLevel(userRole.role?.priority ?? 0)) {
      await this.assertOtherOwnerRemains(userId, tenantId, []);
    }

    await this.userRoleRepository.remove(userRole);

    logger.info({ userId }, "Removed role assignment for user");
  }

  /**
   * Remove role from user by role name
   */
  async removeRoleByName(
    userId: string,
    roleName: string,
    tenantId: string,
    actorId?: string,
  ): Promise<void> {
    const role = await this.roleService.getRoleByName(roleName, tenantId);

    if (!role) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    await this.removeRole(userId, role.id, tenantId, actorId);
  }

  /**
   * Set exact roles for user (replace all)
   */
  async setUserRoles(
    userId: string,
    roleNames: string[],
    tenantId: string,
    assignedBy?: string,
  ): Promise<UserRole[]> {
    const roles = await this.roleService.listRoles(tenantId);
    const requested = roles.filter((r) => roleNames.includes(r.name));
    const current = await this.getUserRoles(userId, tenantId);
    const affected = [...requested, ...current].map((r) => r.priority);

    if (assignedBy) {
      await this.assertActorCanManage(assignedBy, userId, tenantId, affected);
    }
    await this.assertOtherOwnerRemains(
      userId,
      tenantId,
      requested.map((r) => r.priority),
    );

    // Remove all existing roles
    await this.userRoleRepository.delete({
      userId,
      tenantId,
    });

    // Assign new roles
    if (roleNames.length > 0) {
      return this.assignRolesByNames({
        userId,
        roleNames,
        tenantId,
        assignedBy,
      });
    }

    return [];
  }

  /** Highest priority among a user's active roles (0 when none). */
  private async getMaxPriority(userId: string, tenantId: string): Promise<number> {
    const roles = await this.getUserRoles(userId, tenantId);
    return maxPriority(roles.map((r) => r.priority));
  }

  /**
   * The actor must outrank both the target user and every role being granted
   * or revoked. Acting on yourself is allowed only for the target check.
   */
  private async assertActorCanManage(
    actorId: string,
    targetId: string,
    tenantId: string,
    rolePriorities: readonly number[],
  ): Promise<void> {
    const actor = await this.getMaxPriority(actorId, tenantId);
    if (actorId !== targetId) {
      const target = await this.getMaxPriority(targetId, tenantId);
      if (!canManage(actor, target)) {
        throw new ApiException("HIERARCHY_VIOLATION");
      }
    }
    if (!canManage(actor, maxPriority(rolePriorities))) {
      throw new ApiException("HIERARCHY_VIOLATION");
    }
  }

  /**
   * Refuse a change that would leave the tenant with no owner-level user.
   * `keptPriorities` are the roles the user will still hold afterwards.
   */
  private async assertOtherOwnerRemains(
    userId: string,
    tenantId: string,
    keptPriorities: readonly number[],
  ): Promise<void> {
    if (keptPriorities.some(isOwnerLevel)) return;
    const assignments = await this.userRoleRepository.find({
      where: { tenantId },
      relations: ["role"],
    });
    const holders = new Set(
      assignments
        .filter((ur) => !ur.isExpired && isOwnerLevel(ur.role?.priority ?? 0))
        .map((ur) => ur.userId),
    );
    if (holders.has(userId) && holders.size === 1) {
      throw new ApiException("LAST_OWNER");
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string, tenantId: string): Promise<Role[]> {
    const userRoles = await this.userRoleRepository.find({
      where: { userId, tenantId },
      relations: [
        "role",
        "role.rolePermissions",
        "role.rolePermissions.permission",
      ],
    });

    // Filter out expired roles
    return userRoles.filter((ur) => !ur.isExpired).map((ur) => ur.role);
  }

  /**
   * Get user with roles and permissions loaded
   */
  async getUserWithRoles(userId: string, tenantId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: [
        "userRoles",
        "userRoles.role",
        "userRoles.role.rolePermissions",
        "userRoles.role.rolePermissions.permission",
      ],
    });

    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    // Filter out expired role assignments
    user.userRoles = user.userRoles.filter((ur) => !ur.isExpired);

    return user;
  }

  /**
   * Get all permissions for user (aggregated from all roles)
   */
  async getUserPermissions(
    userId: string,
    tenantId: string,
  ): Promise<Permission[]> {
    const roles = await this.getUserRoles(userId, tenantId);

    const permissionMap = new Map<string, Permission>();

    for (const role of roles) {
      if (role.rolePermissions) {
        for (const rp of role.rolePermissions) {
          if (rp.permission) {
            permissionMap.set(rp.permission.id, rp.permission);
          }
        }
      }
    }

    return Array.from(permissionMap.values());
  }

  // ============================================================
  // PERMISSION CHECKS
  // ============================================================

  /**
   * Check if user has specific permission
   */
  async userHasPermission(
    userId: string,
    tenantId: string,
    permissionName: string,
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.hasPermission(permissionName);
  }

  /**
   * Check if user has any of the permissions
   */
  async userHasAnyPermission(
    userId: string,
    tenantId: string,
    permissionNames: string[],
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.hasAnyPermission(permissionNames);
  }

  /**
   * Check if user has all permissions
   */
  async userHasAllPermissions(
    userId: string,
    tenantId: string,
    permissionNames: string[],
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.hasAllPermissions(permissionNames);
  }

  /**
   * Check if user has specific role
   */
  async userHasRole(
    userId: string,
    tenantId: string,
    roleName: string,
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.hasRole(roleName);
  }

  /**
   * Check if user has any of the roles
   */
  async userHasAnyRole(
    userId: string,
    tenantId: string,
    roleNames: string[],
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.hasAnyRole(roleNames);
  }

  /**
   * Check if user is admin
   */
  async userIsAdmin(userId: string, tenantId: string): Promise<boolean> {
    const user = await this.getUserWithRoles(userId, tenantId);
    return user.isAdmin;
  }

  // ============================================================
  // BULK OPERATIONS
  // ============================================================

  /**
   * Assign default role to new user
   */
  async assignDefaultRole(userId: string, tenantId: string): Promise<void> {
    // Get default roles
    const defaultRoles = await this.roleService.listRoles(tenantId, {
      isDefault: true,
      isActive: true,
    });

    if (defaultRoles.length === 0) {
      logger.warn("No default roles found for tenant");
      return;
    }

    // Assign all default roles
    for (const role of defaultRoles) {
      try {
        await this.assignRole({
          userId,
          roleId: role.id,
          tenantId,
          reason: "Auto-assigned default role",
        });
      } catch (error) {
        // Skip if already assigned
        if (!(isConflict(error))) {
          throw error;
        }
      }
    }

    logger.info({ userId, roleCount: defaultRoles.length }, "Assigned default roles to user");
  }

  /**
   * Remove expired role assignments
   */
  async cleanupExpiredRoles(tenantId: string): Promise<number> {
    const expiredAssignments = await this.userRoleRepository
      .createQueryBuilder("userRole")
      .where("userRole.tenantId = :tenantId", { tenantId })
      .andWhere("userRole.expiresAt < :now", { now: new Date() })
      .andWhere("userRole.expiresAt IS NOT NULL")
      .getMany();

    if (expiredAssignments.length > 0) {
      await this.userRoleRepository.remove(expiredAssignments);
      logger.info({ count: expiredAssignments.length }, "Removed expired role assignments");
    }

    return expiredAssignments.length;
  }

  /**
   * Get users by role
   */
  async getUsersByRole(roleId: string, tenantId: string): Promise<User[]> {
    const userRoles = await this.userRoleRepository.find({
      where: { roleId, tenantId },
      relations: ["user"],
    });

    return userRoles.filter((ur) => !ur.isExpired).map((ur) => ur.user);
  }

  /**
   * Get users by role name
   */
  async getUsersByRoleName(
    roleName: string,
    tenantId: string,
  ): Promise<User[]> {
    const role = await this.roleService.getRoleByName(roleName, tenantId);

    if (!role) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    return this.getUsersByRole(role.id, tenantId);
  }

  /**
   * Get role statistics
   */
  async getRoleStats(
    roleId: string,
    tenantId: string,
  ): Promise<{
    totalUsers: number;
    activeUsers: number;
    expiredAssignments: number;
  }> {
    const userRoles = await this.userRoleRepository.find({
      where: { roleId, tenantId },
    });

    const active = userRoles.filter((ur) => !ur.isExpired);
    const expired = userRoles.filter((ur) => ur.isExpired);

    return {
      totalUsers: userRoles.length,
      activeUsers: active.length,
      expiredAssignments: expired.length,
    };
  }

  // ============================================================
  // SEEDING & INITIALIZATION
  // ============================================================

  /**
   * Initialize RBAC for tenant (create default permissions and roles)
   */
  async initializeTenant(tenantId: string, createdBy?: string): Promise<void> {
    logger.info({ tenantId }, "Initializing RBAC for tenant");

    // 1. Create default permissions
    const permissions =
      await this.permissionService.seedDefaultPermissions(tenantId);
    logger.info({ count: permissions.length }, "Created default permissions");

    // 2. Create default roles
    const roles = await this.roleService.seedDefaultRoles(tenantId, createdBy);
    logger.info({ count: roles.length }, "Created default roles");

    logger.info({ tenantId }, "RBAC initialization complete for tenant");
  }

  /**
   * Assign admin role to user (convenience method)
   */
  async makeUserAdmin(
    userId: string,
    tenantId: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.assignRolesByNames({
      userId,
      roleNames: ["admin"],
      tenantId,
      assignedBy,
      reason: "Admin access granted",
    });

    logger.info({ userId }, "User is now an admin");
  }

  /**
   * Remove admin role from user
   */
  async removeAdminAccess(userId: string, tenantId: string): Promise<void> {
    await this.removeRoleByName(userId, "admin", tenantId);
    logger.info({ userId }, "Removed admin access from user");
  }
}

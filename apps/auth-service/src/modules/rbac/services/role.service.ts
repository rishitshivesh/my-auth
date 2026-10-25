// apps/auth-service/src/modules/rbac/services/role.service.ts

import { Injectable } from "@nestjs/common";
import { ApiException, isConflict } from "../../../common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { Role, RolePermission, Permission } from "@repo/database";
import { logger } from "@/common/logger";

const RESERVED_ROLE_NAMES = new Set(["super_admin", "sentry-internal"]);

export interface CreateRoleDto {
  tenantId: string;
  name: string;
  displayName?: string;
  description?: string;
  scope?: string;
  isSystem?: boolean;
  isDefault?: boolean;
  priority?: number;
  metadata?: Record<string, any>;
  createdBy?: string;
  permissionNames?: string[]; // Permission names to assign
}

export interface UpdateRoleDto {
  displayName?: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  priority?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
  ) {}

  /**
   * Create a new role
   */
  async createRole(data: CreateRoleDto): Promise<Role> {
    // Role names become JWT `groups`; platform-operator names would grant superadmin.
    if (RESERVED_ROLE_NAMES.has(data.name.trim().toLowerCase()) || /-internal$/i.test(data.name.trim())) {
      throw new ApiException("VALIDATION_FAILED", { detail: `Role name "${data.name}" is reserved` });
    }

    // Check if role already exists
    const existing = await this.roleRepository.findOne({
      where: {
        tenantId: data.tenantId,
        name: data.name,
      },
    });

    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: `Role ${data.name} already exists` });
    }

    const role = await this.roleRepository.save({
      tenantId: data.tenantId,
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      scope: data.scope || "tenant",
      isSystem: data.isSystem || false,
      isActive: true,
      isDefault: data.isDefault || false,
      priority: data.priority || 0,
      metadata: data.metadata,
      createdBy: data.createdBy,
    });

    // Assign permissions if provided
    if (data.permissionNames && data.permissionNames.length > 0) {
      // Internal path: the role was just created, so the system-role guard
      // in assignPermissionsToRole() (which protects existing roles) must not apply.
      await this.attachPermissions(
        role.id,
        data.tenantId,
        data.permissionNames,
        data.createdBy,
      );
    }

    logger.info({ roleName: role.name }, "Created role");

    return role;
  }

  /**
   * Get role by ID
   */
  async getRole(
    id: string,
    tenantId: string,
    loadPermissions = false,
  ): Promise<Role> {
    const query = this.roleRepository
      .createQueryBuilder("role")
      .where("role.id = :id", { id })
      .andWhere("role.tenantId = :tenantId", { tenantId });

    if (loadPermissions) {
      query
        .leftJoinAndSelect("role.rolePermissions", "rolePermission")
        .leftJoinAndSelect("rolePermission.permission", "permission");
    }

    const role = await query.getOne();

    if (!role) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    return role;
  }

  /**
   * Get role by name
   */
  async getRoleByName(
    name: string,
    tenantId: string,
    loadPermissions = false,
  ): Promise<Role | null> {
    const query = this.roleRepository
      .createQueryBuilder("role")
      .where("role.name = :name", { name })
      .andWhere("role.tenantId = :tenantId", { tenantId });

    if (loadPermissions) {
      query
        .leftJoinAndSelect("role.rolePermissions", "rolePermission")
        .leftJoinAndSelect("rolePermission.permission", "permission");
    }

    return query.getOne();
  }

  /**
   * List all roles for tenant
   */
  async listRoles(
    tenantId: string,
    options?: {
      isActive?: boolean;
      isSystem?: boolean;
      isDefault?: boolean;
      loadPermissions?: boolean;
    },
  ): Promise<Role[]> {
    const query = this.roleRepository
      .createQueryBuilder("role")
      .where("role.tenantId = :tenantId", { tenantId });

    if (options?.isActive !== undefined) {
      query.andWhere("role.isActive = :isActive", {
        isActive: options.isActive,
      });
    }

    if (options?.isSystem !== undefined) {
      query.andWhere("role.isSystem = :isSystem", {
        isSystem: options.isSystem,
      });
    }

    if (options?.isDefault !== undefined) {
      query.andWhere("role.isDefault = :isDefault", {
        isDefault: options.isDefault,
      });
    }

    if (options?.loadPermissions) {
      query
        .leftJoinAndSelect("role.rolePermissions", "rolePermission")
        .leftJoinAndSelect("rolePermission.permission", "permission");
    }

    query.orderBy("role.priority", "DESC").addOrderBy("role.name", "ASC");

    return query.getMany();
  }

  /**
   * Update role
   */
  async updateRole(
    id: string,
    tenantId: string,
    data: UpdateRoleDto,
  ): Promise<Role> {
    const role = await this.getRole(id, tenantId);

    if (role.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot update system role" });
    }

    Object.assign(role, data);

    await this.roleRepository.save(role);

    logger.info({ roleName: role.name }, "Updated role");

    return role;
  }

  /**
   * Delete role
   */
  async deleteRole(id: string, tenantId: string): Promise<void> {
    const role = await this.getRole(id, tenantId);

    if (role.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot delete system role" });
    }

    if (role.isDefault) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot delete default role" });
    }

    await this.roleRepository.delete({ id: role.id });

    logger.info({ roleName: role.name }, "Deleted role");
  }

  /**
   * Assign permissions to role
   */
  async assignPermissionsToRole(
    roleId: string,
    tenantId: string,
    permissionNames: string[],
    assignedBy?: string,
  ): Promise<void> {
    const role = await this.getRole(roleId, tenantId);

    if (role.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot modify system role permissions" });
    }

    await this.attachPermissions(roleId, tenantId, permissionNames, assignedBy, role.name);
  }

  /**
   * Resolve permission names to entities; throws BAD_REQUEST listing unknown names.
   */
  private async resolvePermissions(
    tenantId: string,
    permissionNames: string[],
  ): Promise<Permission[]> {
    const uniqueNames = [...new Set(permissionNames)];
    const permissions = await this.permissionRepository.find({
      where: {
        tenantId,
        name: In(uniqueNames),
      },
    });

    if (permissions.length !== uniqueNames.length) {
      const foundNames = new Set(permissions.map((p) => p.name));
      const missing = uniqueNames.filter((name) => !foundNames.has(name));
      throw new ApiException("BAD_REQUEST", { detail: `Permissions not found: ${missing.join(", ")}` });
    }
    return permissions;
  }

  /**
   * Add permissions to a role without the system-role guard (callers enforce it).
   */
  private async attachPermissions(
    roleId: string,
    tenantId: string,
    permissionNames: string[],
    assignedBy?: string,
    roleName?: string,
  ): Promise<void> {
    const permissions = await this.resolvePermissions(tenantId, permissionNames);

    // Get existing role permissions
    const existing = await this.rolePermissionRepository.find({
      where: { roleId, tenantId },
    });

    const existingPermissionIds = new Set(
      existing.map((rp) => rp.permissionId),
    );

    // Add new permissions
    const toAdd = permissions.filter((p) => !existingPermissionIds.has(p.id));

    if (toAdd.length > 0) {
      const rolePermissions = toAdd.map((permission) => ({
        tenantId,
        roleId,
        permissionId: permission.id,
        assignedBy,
        assignedAt: new Date(),
      }));

      await this.rolePermissionRepository.save(rolePermissions);

      logger.info({ count: toAdd.length, roleName }, "Assigned permissions to role");
    }
  }

  /**
   * Remove permissions from role
   */
  async removePermissionsFromRole(
    roleId: string,
    tenantId: string,
    permissionNames: string[],
  ): Promise<void> {
    const role = await this.getRole(roleId, tenantId);

    if (role.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot modify system role permissions" });
    }

    // Get permissions by names
    const permissions = await this.permissionRepository.find({
      where: {
        tenantId,
        name: In(permissionNames),
      },
    });

    const permissionIds = permissions.map((p) => p.id);

    // Delete role permissions
    await this.rolePermissionRepository.delete({
      roleId,
      tenantId,
      permissionId: In(permissionIds),
    });

    logger.info({ count: permissions.length, roleName: role.name }, "Removed permissions from role");
  }

  /**
   * Set exact permissions for role (replace all)
   */
  async setRolePermissions(
    roleId: string,
    tenantId: string,
    permissionNames: string[],
    assignedBy?: string,
  ): Promise<void> {
    const role = await this.getRole(roleId, tenantId);

    if (role.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot modify system role permissions" });
    }

    // Validate every name BEFORE touching existing grants, then swap the set
    // in one transaction so a failure can never leave the role stripped.
    const permissions =
      permissionNames.length > 0
        ? await this.resolvePermissions(tenantId, permissionNames)
        : [];

    await this.rolePermissionRepository.manager.transaction(async (manager) => {
      const rpRepo = manager.getRepository(RolePermission);
      await rpRepo.delete({ roleId, tenantId });
      if (permissions.length > 0) {
        await rpRepo.save(
          permissions.map((permission) => ({
            tenantId,
            roleId,
            permissionId: permission.id,
            assignedBy,
            assignedAt: new Date(),
          })),
        );
      }
    });

    logger.info({ count: permissionNames.length, roleName: role.name }, "Set permissions for role");
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(
    roleId: string,
    tenantId: string,
  ): Promise<Permission[]> {
    const rolePermissions = await this.rolePermissionRepository.find({
      where: { roleId, tenantId },
      relations: ["permission"],
    });

    return rolePermissions.map((rp) => rp.permission);
  }

  /**
   * Seed default roles for tenant
   */
  async seedDefaultRoles(
    tenantId: string,
    createdBy?: string,
  ): Promise<Role[]> {
    const roles = [
      {
        name: "admin",
        displayName: "Admin",
        description: "Tenant administrator with full tenant access",
        priority: 900,
        isSystem: true,
        permissionNames: [
          "users:*",
          "roles:*",
          "permissions:read",
          "clients:*",
          "api:*",
        ],
      },
      {
        name: "developer",
        displayName: "Developer",
        description: "Developer with OAuth client management access",
        priority: 500,
        isSystem: false,
        permissionNames: [
          "users:read",
          "clients:*",
          "api:read",
          "api:write",
          "profile:*",
        ],
      },
      {
        name: "user",
        displayName: "User",
        description: "Standard user with basic access",
        priority: 100,
        isSystem: false,
        isDefault: true,
        permissionNames: ["profile:read", "profile:write"],
      },
    ];

    const created: Role[] = [];

    for (const roleData of roles) {
      try {
        const role = await this.createRole({
          tenantId,
          ...roleData,
          createdBy,
        });
        created.push(role);
      } catch (error) {
        if (isConflict(error)) {
          logger.info({ roleName: roleData.name }, "Skipping existing role");
        } else {
          throw error;
        }
      }
    }

    return created;
  }
}

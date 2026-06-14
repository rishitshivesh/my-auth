// apps/auth-service/src/modules/rbac/services/role.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { Role, RolePermission, Permission } from "@repo/database";
import { logger } from "@/common/logger";

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
    // Check if role already exists
    const existing = await this.roleRepository.findOne({
      where: {
        tenantId: data.tenantId,
        name: data.name,
      },
    });

    if (existing) {
      throw new ConflictException(`Role ${data.name} already exists`);
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
      await this.assignPermissionsToRole(
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
      throw new NotFoundException("Role not found");
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
      throw new ConflictException("Cannot update system role");
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
      throw new ConflictException("Cannot delete system role");
    }

    if (role.isDefault) {
      throw new ConflictException("Cannot delete default role");
    }

    await this.roleRepository.remove(role);

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
      throw new ConflictException("Cannot modify system role permissions");
    }

    // Get permissions by names
    const permissions = await this.permissionRepository.find({
      where: {
        tenantId,
        name: In(permissionNames),
      },
    });

    if (permissions.length !== permissionNames.length) {
      const foundNames = permissions.map((p) => p.name);
      const missing = permissionNames.filter(
        (name) => !foundNames.includes(name),
      );
      throw new BadRequestException(
        `Permissions not found: ${missing.join(", ")}`,
      );
    }

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

      logger.info({ count: toAdd.length, roleName: role.name }, "Assigned permissions to role");
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
      throw new ConflictException("Cannot modify system role permissions");
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
      throw new ConflictException("Cannot modify system role permissions");
    }

    // Remove all existing permissions
    await this.rolePermissionRepository.delete({
      roleId,
      tenantId,
    });

    // Add new permissions
    if (permissionNames.length > 0) {
      await this.assignPermissionsToRole(
        roleId,
        tenantId,
        permissionNames,
        assignedBy,
      );
    }

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
        name: "super_admin",
        displayName: "Super Admin",
        description: "Platform administrator with full access",
        priority: 1000,
        isSystem: true,
        permissionNames: ["*:*"],
      },
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
        if (error instanceof ConflictException) {
          logger.info({ roleName: roleData.name }, "Skipping existing role");
        } else {
          throw error;
        }
      }
    }

    return created;
  }
}

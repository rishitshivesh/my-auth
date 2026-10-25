// apps/auth-service/src/modules/rbac/services/permission.service.ts

import { Injectable } from "@nestjs/common";
import { ApiException, isConflict } from "../../../common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Permission } from "@repo/database";
import { logger } from "@/common/logger";

export interface CreatePermissionDto {
  tenantId: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
  scope?: string;
  isSystem?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdatePermissionDto {
  description?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
  ) {}

  /**
   * Create a new permission
   */
  async createPermission(data: CreatePermissionDto): Promise<Permission> {
    // Build permission name if not provided
    const name = data.name || `${data.resource}:${data.action}`;

    // Check if permission already exists
    const existing = await this.permissionRepository.findOne({
      where: {
        tenantId: data.tenantId,
        name,
      },
    });

    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: `Permission ${name} already exists` });
    }

    const permission = await this.permissionRepository.save({
      tenantId: data.tenantId,
      name,
      resource: data.resource,
      action: data.action,
      description: data.description,
      scope: data.scope || "tenant",
      isSystem: data.isSystem || false,
      metadata: data.metadata,
    });

    logger.info({ permissionName: permission.name }, "Created permission");

    return permission;
  }

  /**
   * Bulk create permissions
   */
  async bulkCreatePermissions(
    tenantId: string,
    permissions: Array<{
      resource: string;
      action: string;
      description?: string;
    }>,
  ): Promise<Permission[]> {
    const created: Permission[] = [];

    for (const perm of permissions) {
      try {
        const permission = await this.createPermission({
          tenantId,
          name: `${perm.resource}:${perm.action}`,
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
        });
        created.push(permission);
      } catch (error) {
        // Skip if already exists
        if (isConflict(error)) {
          logger.info({ permission: `${perm.resource}:${perm.action}` }, "Skipping existing permission");
        } else {
          throw error;
        }
      }
    }

    return created;
  }

  /**
   * Get permission by ID
   */
  async getPermission(id: string, tenantId: string): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id, tenantId },
    });

    if (!permission) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    return permission;
  }

  /**
   * Get permission by name
   */
  async getPermissionByName(
    name: string,
    tenantId: string,
  ): Promise<Permission | null> {
    return this.permissionRepository.findOne({
      where: { name, tenantId },
    });
  }

  /**
   * List all permissions for tenant
   */
  async listPermissions(
    tenantId: string,
    options?: {
      resource?: string;
      action?: string;
      scope?: string;
      isSystem?: boolean;
    },
  ): Promise<Permission[]> {
    const query = this.permissionRepository
      .createQueryBuilder("permission")
      .where("permission.tenantId = :tenantId", { tenantId });

    if (options?.resource) {
      query.andWhere("permission.resource = :resource", {
        resource: options.resource,
      });
    }

    if (options?.action) {
      query.andWhere("permission.action = :action", { action: options.action });
    }

    if (options?.scope) {
      query.andWhere("permission.scope = :scope", { scope: options.scope });
    }

    if (options?.isSystem !== undefined) {
      query.andWhere("permission.isSystem = :isSystem", {
        isSystem: options.isSystem,
      });
    }

    query
      .orderBy("permission.resource", "ASC")
      .addOrderBy("permission.action", "ASC");

    return query.getMany();
  }

  /**
   * Get permissions grouped by resource
   */
  async getPermissionsByResource(
    tenantId: string,
  ): Promise<Record<string, Permission[]>> {
    const permissions = await this.listPermissions(tenantId);

    const grouped: Record<string, Permission[]> = {};

    for (const permission of permissions) {
      if (!grouped[permission.resource]) {
        grouped[permission.resource] = [];
      }
      grouped[permission.resource]?.push(permission);
    }

    return grouped;
  }

  /**
   * Update permission
   */
  async updatePermission(
    id: string,
    tenantId: string,
    data: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.getPermission(id, tenantId);

    if (permission.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot update system permission" });
    }

    Object.assign(permission, data);

    await this.permissionRepository.save(permission);

    logger.info({ permissionName: permission.name }, "Updated permission");

    return permission;
  }

  /**
   * Delete permission
   */
  async deletePermission(id: string, tenantId: string): Promise<void> {
    const permission = await this.getPermission(id, tenantId);

    if (permission.isSystem) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Cannot delete system permission" });
    }

    await this.permissionRepository.delete({ id: permission.id });

    logger.info({ permissionName: permission.name }, "Deleted permission");
  }

  /**
   * Check if permissions exist
   */
  async permissionsExist(
    permissionNames: string[],
    tenantId: string,
  ): Promise<boolean> {
    const count = await this.permissionRepository.count({
      where: permissionNames.map((name) => ({ name, tenantId })),
    });

    return count === permissionNames.length;
  }

  /**
   * Get permissions by names
   */
  async getPermissionsByNames(
    permissionNames: string[],
    tenantId: string,
  ): Promise<Permission[]> {
    if (permissionNames.length === 0) {
      return [];
    }

    return this.permissionRepository
      .createQueryBuilder("permission")
      .where("permission.tenantId = :tenantId", { tenantId })
      .andWhere("permission.name IN (:...names)", { names: permissionNames })
      .getMany();
  }

  /**
   * Seed default permissions for a tenant
   */
  async seedDefaultPermissions(tenantId: string): Promise<Permission[]> {
    const defaultPermissions = [
      // User permissions
      { resource: "users", action: "read", description: "View users" },
      {
        resource: "users",
        action: "write",
        description: "Create/update users",
      },
      { resource: "users", action: "delete", description: "Delete users" },
      { resource: "users", action: "*", description: "All user permissions" },

      // Role permissions
      { resource: "roles", action: "read", description: "View roles" },
      {
        resource: "roles",
        action: "write",
        description: "Create/update roles",
      },
      { resource: "roles", action: "delete", description: "Delete roles" },
      { resource: "roles", action: "*", description: "All role permissions" },

      // Permission permissions
      {
        resource: "permissions",
        action: "read",
        description: "View permissions",
      },
      {
        resource: "permissions",
        action: "write",
        description: "Manage permissions",
      },

      // OAuth client permissions
      {
        resource: "clients",
        action: "read",
        description: "View OAuth clients",
      },
      {
        resource: "clients",
        action: "write",
        description: "Create/update clients",
      },
      { resource: "clients", action: "delete", description: "Delete clients" },
      {
        resource: "clients",
        action: "*",
        description: "All client permissions",
      },

      // API permissions
      { resource: "api", action: "read", description: "Read API resources" },
      { resource: "api", action: "write", description: "Write API resources" },
      { resource: "api", action: "*", description: "All API permissions" },

      // Profile permissions
      { resource: "profile", action: "read", description: "View own profile" },
      {
        resource: "profile",
        action: "write",
        description: "Update own profile",
      },
      { resource: "profile", action: "*", description: "All profile permissions" },

      // Super admin wildcard
      {
        resource: "*",
        action: "*",
        description: "All permissions (super admin)",
      },
    ];

    return this.bulkCreatePermissions(tenantId, defaultPermissions);
  }
}

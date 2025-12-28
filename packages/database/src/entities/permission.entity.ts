// packages/database/src/entities/permission.entity.ts

import { Entity, Column, ManyToMany, Index, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Role } from "./role.entity";

/**
 * Permission Entity
 *
 * Defines granular permissions for actions on resources.
 * Format: resource:action (e.g., users:read, clients:write)
 *
 * Permissions are tenant-scoped.
 */
@Entity("permissions")
@Unique(["tenantId", "name"])
@Index(["tenantId"])
@Index(["resource"])
@Index(["action"])
export class Permission extends BaseEntity {
  // ============================================================
  // TENANT RELATIONSHIP
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  @Index()
  tenantId!: string;

  // ============================================================
  // PERMISSION DETAILS
  // ============================================================

  @Column({
    type: "varchar",
    length: 100,
    unique: false, // Unique per tenant via composite index
    comment: "Permission name (e.g., users:read)",
  })
  name!: string;

  @Column({
    type: "varchar",
    length: 50,
    comment: "Resource type (e.g., users, clients, api)",
  })
  resource!: string;

  @Column({
    type: "varchar",
    length: 50,
    comment: "Action (e.g., read, write, delete, manage, *)",
  })
  action!: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Human-readable description",
  })
  description?: string;

  @Column({
    type: "varchar",
    length: 50,
    default: "tenant",
    comment: "Scope level: platform, tenant, user",
  })
  scope!: string;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "boolean",
    default: false,
    name: "is_system",
    comment: "System permission (cannot be deleted)",
  })
  isSystem!: boolean;

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Additional metadata (conditions, constraints, etc.)",
  })
  metadata?: {
    conditions?: string[]; // e.g., ["own_resource_only"]
    constraints?: Record<string, any>;
  };

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @ManyToMany(() => Role, (role) => role.permissions)
  roles!: Role[];

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Get resource from permission name
   * users:read → users
   */
  static getResource(permissionName: string): string {
    return permissionName.split(":")[0] as string;
  }

  /**
   * Get action from permission name
   * users:read → read
   */
  static getAction(permissionName: string): string {
    return permissionName.split(":")[1] as string;
  }

  /**
   * Parse permission name into components
   */
  static parse(permissionName: string): { resource: string; action: string } {
    const [resource, action] = permissionName.split(":") as [string, string];
    return { resource, action };
  }

  /**
   * Check if permission matches pattern
   * users:read matches users:* or *:read or *:*
   */
  matches(pattern: string): boolean {
    const [patternResource, patternAction] = pattern.split(":");

    // Exact match
    if (this.name === pattern) {
      return true;
    }

    // Wildcard resource (*:read)
    if (patternResource === "*" && this.action === patternAction) {
      return true;
    }

    // Wildcard action (users:*)
    if (this.resource === patternResource && patternAction === "*") {
      return true;
    }

    // Full wildcard (*:*)
    if (patternResource === "*" && patternAction === "*") {
      return true;
    }

    return false;
  }

  /**
   * Check if this permission implies another permission
   * users:* implies users:read
   */
  implies(permission: Permission): boolean {
    // Same permission
    if (this.name === permission.name) {
      return true;
    }

    // Same resource, this has wildcard action
    if (this.resource === permission.resource && this.action === "*") {
      return true;
    }

    // This has full wildcard
    if (this.resource === "*" && this.action === "*") {
      return true;
    }

    return false;
  }

  /**
   * Get full permission name
   */
  get fullName(): string {
    return this.name;
  }

  /**
   * Check if this is a wildcard permission
   */
  get isWildcard(): boolean {
    return this.resource === "*" || this.action === "*";
  }
}

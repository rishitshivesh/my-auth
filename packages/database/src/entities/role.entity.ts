import {
  Entity,
  Column,
  ManyToMany,
  JoinTable,
  Index,
  Unique,
  OneToMany,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Permission } from "./permission.entity";
import { User } from "./user.entity";
import { RolePermission } from "./role-permission.entity";

/**
 * Role Entity
 *
 * Groups permissions into named roles.
 * Users are assigned roles, roles grant permissions.
 *
 * Roles are tenant-scoped.
 */
@Entity("roles")
@Unique(["tenantId", "name"])
@Index(["tenantId"])
@Index(["isSystem"])
export class Role extends BaseEntity {
  // ============================================================
  // TENANT RELATIONSHIP
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  // ============================================================
  // ROLE DETAILS
  // ============================================================

  @Column({
    type: "varchar",
    length: 100,
    unique: false, // Unique per tenant via composite index
    comment: "Role name (e.g., admin, developer, user)",
  })
  name!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "display_name",
    comment: "Human-readable display name",
  })
  displayName?: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Role description",
  })
  description?: string;

  @Column({
    type: "varchar",
    length: 50,
    default: "tenant",
    comment: "Scope level: platform, tenant, custom",
  })
  scope!: string;

  // ============================================================
  // FLAGS
  // ============================================================

  @Column({
    type: "boolean",
    default: false,
    name: "is_system",
    comment: "System role (cannot be deleted or modified)",
  })
  isSystem!: boolean;

  @Column({
    type: "boolean",
    default: true,
    name: "is_active",
    comment: "Whether this role is active",
  })
  isActive!: boolean;

  @Column({
    type: "boolean",
    default: false,
    name: "is_default",
    comment: "Automatically assigned to new users",
  })
  isDefault!: boolean;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "integer",
    default: 0,
    comment: "Higher priority = more powerful (for conflict resolution)",
  })
  priority!: number;

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Additional metadata",
  })
  metadata?: {
    color?: string;
    icon?: string;
    maxUsers?: number;
    features?: string[];
  };

  @Column({
    type: "uuid",
    nullable: true,
    name: "created_by",
    comment: "User who created this role",
  })
  createdBy?: string;

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  // Many-to-Many via explicit RolePermission entity
  // NO @JoinTable - we have explicit RolePermission entity with metadata
  @ManyToMany(() => Permission, (permission) => permission.roles)
  permissions!: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users!: User[];

  // OneToMany to access join table metadata
  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions!: RolePermission[];

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Check if role has a specific permission
   */
  hasPermission(permissionName: string): boolean {
    if (!this.permissions) {
      return false;
    }

    return this.permissions.some((permission) => {
      // Exact match
      if (permission.name === permissionName) {
        return true;
      }

      // Check if permission implies the requested one
      const [resource, action] = permissionName.split(":");

      // Permission with wildcard action (users:*)
      if (permission.resource === resource && permission.action === "*") {
        return true;
      }

      // Full wildcard (*:*)
      if (permission.resource === "*" && permission.action === "*") {
        return true;
      }

      return false;
    });
  }

  /**
   * Check if role has any of the permissions
   */
  hasAnyPermission(permissionNames: string[]): boolean {
    return permissionNames.some((name) => this.hasPermission(name));
  }

  /**
   * Check if role has all permissions
   */
  hasAllPermissions(permissionNames: string[]): boolean {
    return permissionNames.every((name) => this.hasPermission(name));
  }

  /**
   * Get all permission names for this role
   */
  getPermissionNames(): string[] {
    if (!this.permissions) {
      return [];
    }
    return this.permissions.map((p) => p.name);
  }

  /**
   * Get permissions grouped by resource
   */
  getPermissionsByResource(): Record<string, string[]> {
    if (!this.permissions) {
      return {};
    }

    const grouped: Record<string, string[]> = {};

    for (const permission of this.permissions) {
      if (!grouped[permission.resource]) {
        grouped[permission.resource] = [];
      }
      // @ts-ignore
      grouped[permission.resource].push(permission.action);
    }

    return grouped;
  }

  /**
   * Check if this is an admin role
   */
  get isAdmin(): boolean {
    return (
      this.name === "admin" ||
      this.name === "super_admin" ||
      this.hasPermission("*:*")
    );
  }

  /**
   * Check if this role can be modified
   */
  get isModifiable(): boolean {
    return !this.isSystem;
  }

  /**
   * Check if this role can be deleted
   */
  get isDeletable(): boolean {
    return !this.isSystem && !this.isDefault;
  }
}

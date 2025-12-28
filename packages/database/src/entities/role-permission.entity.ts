import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Role } from "./role.entity";
import { Permission } from "./permission.entity";

/**
 * RolePermission Entity (Join Table)
 *
 * Explicit join table for Role-Permission many-to-many relationship.
 * Created automatically by @JoinTable in Role entity, but can be
 * defined explicitly for additional metadata.
 */
@Entity("role_permissions")
@Unique(["roleId", "permissionId"])
@Index(["roleId"])
@Index(["permissionId"])
@Index(["tenantId"])
export class RolePermission extends BaseEntity {
  // ============================================================
  // TENANT RELATIONSHIP
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;

  @ManyToOne(() => Role, (role) => role.rolePermissions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "role_id" })
  role!: Role;

  @Column({ type: "uuid", name: "permission_id" })
  permissionId!: string;

  @ManyToOne(() => Permission, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "permission_id" })
  permission!: Permission;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "uuid",
    nullable: true,
    name: "assigned_by",
    comment: "User who assigned this permission to the role",
  })
  assignedBy?: string;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "assigned_at",
    default: () => "CURRENT_TIMESTAMP",
    comment: "When permission was assigned",
  })
  assignedAt!: Date;

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Additional constraints or conditions for this permission",
  })
  constraints?: {
    conditions?: string[];
    resourceFilters?: Record<string, any>;
    fieldRestrictions?: string[];
  };
}

import {
  Entity,
  Column,
  Index,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { Permission } from "./permission.entity";

/**
 * Role Entity
 *
 * Defines roles within the RBAC system:
 * - System roles (cannot be deleted)
 * - Custom tenant roles
 * - Hierarchical roles (role inheritance)
 */
@Entity("roles")
@Index(["tenantId", "name"], { unique: true })
@Index(["tenantId"])
@Index(["isSystem"])
export class Role extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "is_system",
    comment: "System roles cannot be modified or deleted",
  })
  isSystem!: boolean;

  @Column({
    type: "uuid",
    nullable: true,
    name: "parent_role_id",
    comment: "Parent role for inheritance",
  })
  parentRoleId?: string;

  @ManyToOne(() => Role, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "parent_role_id" })
  parentRole?: Role;

  @ManyToMany(() => Permission, (permission) => permission.roles, {
    cascade: true,
  })
  @JoinTable({
    name: "role_permissions",
    joinColumn: { name: "role_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "permission_id", referencedColumnName: "id" },
  })
  permissions!: Permission[];
}

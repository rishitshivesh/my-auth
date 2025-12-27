import { Entity, Column, Index, ManyToMany } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Role } from "./role.entity";

/**
 * Permission Entity
 *
 * Defines granular permissions in the system:
 * - Resource-based permissions (user, tenant, role, etc.)
 * - Action-based permissions (create, read, update, delete)
 */
@Entity("permissions")
@Index(["resource", "action"], { unique: true })
@Index(["resource"])
export class Permission extends BaseEntity {
  @Column({ type: "varchar", length: 100 })
  resource!: string;

  @Column({ type: "varchar", length: 50 })
  action!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @ManyToMany(() => Role, (role: any) => role.permissions)
  roles!: Role[];
}

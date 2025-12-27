import {
  Entity,
  Column,
  Index,
  ManyToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Role } from "./role.entity";
import { Tenant } from "./tenant.entity";

/**
 * Permission Entity (UPDATED FOR MULTI-TENANT)
 */
@Entity("permissions")
@Index(["tenantId", "resource", "action"], { unique: true }) // ← Tenant-scoped unique
@Index(["tenantId"])
@Index(["resource"])
export class Permission extends BaseEntity {
  // ✅ ADD THIS - Tenant ID
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 100 })
  resource!: string;

  @Column({ type: "varchar", length: 50 })
  action!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @ManyToMany(() => Role, (role: any) => role.permissions)
  roles!: Role[];
}

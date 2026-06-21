import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";

@Entity("user_invites")
@Index(["tenantId"])
@Index(["email"])
@Index(["token"], { unique: true })
export class UserInvite extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant?: Tenant;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 128, unique: true })
  token!: string;

  @Column({ type: "jsonb", name: "role_ids", default: [] })
  roleIds!: string[];

  @Column({ type: "uuid", nullable: true, name: "invited_by" })
  invitedBy?: string;

  @Column({ type: "timestamp with time zone", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamp with time zone", nullable: true, name: "accepted_at" })
  acceptedAt?: Date;
}

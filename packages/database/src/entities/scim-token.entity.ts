import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("scim_tokens")
@Index(["tenantId"])
@Index(["tokenHash"], { unique: true })
export class ScimToken extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 128, name: "token_hash" })
  tokenHash!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "timestamp with time zone", name: "last_used_at", nullable: true })
  lastUsedAt?: Date;

  @Column({ type: "timestamp with time zone", name: "expires_at", nullable: true })
  expiresAt?: Date;
}

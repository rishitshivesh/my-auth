import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from "typeorm";

/**
 * Per-tenant password and lockout policy. Lives in the tenant schema (cloned from
 * template). A missing row means "platform defaults"; tenants can only be stricter
 * than the platform minimum (see modules/auth/tenant-password-policy.service.ts).
 */
@Entity({ name: "tenant_password_policy" })
@Index(["tenantId"], { unique: true })
export class TenantPasswordPolicy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @Column({ type: "int", default: 12, name: "min_length" })
  minLength!: number;

  @Column({ type: "boolean", default: true, name: "require_common_password_check" })
  requireCommonPasswordCheck!: boolean;

  /** Number of previous password hashes remembered (0 = none). */
  @Column({ type: "int", default: 5, name: "history_count" })
  historyCount!: number;

  /** Days before a password expires (0 = never). */
  @Column({ type: "int", default: 0, name: "max_age_days" })
  maxAgeDays!: number;

  /** Failed sign-ins before the account locks. */
  @Column({ type: "int", default: 5, name: "lockout_threshold" })
  lockoutThreshold!: number;

  @Column({ type: "int", default: 15, name: "lockout_duration_minutes" })
  lockoutDurationMinutes!: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;
}

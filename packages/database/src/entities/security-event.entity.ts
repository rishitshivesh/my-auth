import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";

/**
 * Security Event Entity
 *
 * Logs all security-related events:
 * - Login attempts (success/failure)
 * - Password changes
 * - MFA events
 * - Account lockouts
 * - Suspicious activities
 */
@Entity("security_events")
@Index(["userId"])
@Index(["tenantId"])
@Index(["eventType"])
@Index(["severity"])
@Index(["createdAt"])
@Index(["ipAddress"])
export class SecurityEvent extends BaseEntity {
  @Column({ type: "uuid", nullable: true, name: "user_id" })
  userId?: string;

  @ManyToOne(() => User, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "uuid", nullable: true, name: "tenant_id" })
  tenantId?: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant?: Tenant;

  @Column({
    type: "varchar",
    length: 100,
    name: "event_type",
  })
  eventType!: string;

  @Column({
    type: "enum",
    enum: ["info", "warning", "critical"],
    default: "info",
  })
  severity!: "info" | "warning" | "critical";

  @Column({
    type: "varchar",
    length: 45,
    name: "ip_address",
  })
  ipAddress!: string;

  @Column({
    type: "text",
    name: "user_agent",
  })
  userAgent!: string;

  @Column({
    type: "jsonb",
    nullable: true,
    name: "device_info",
  })
  deviceInfo?: Record<string, any>;

  @Column({
    type: "jsonb",
    default: {},
    comment: "Additional event metadata",
  })
  metadata!: Record<string, any>;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    comment: "Geographic location",
  })
  location?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "is_anomaly",
    comment: "Whether this event was flagged as anomalous",
  })
  isAnomaly!: boolean;
}

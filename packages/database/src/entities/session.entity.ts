import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

/**
 * Session Entity
 *
 * Tracks active user sessions with:
 * - Device fingerprinting
 * - IP and location tracking
 * - Activity monitoring
 * - Automatic expiration
 */
@Entity("sessions")
@Index(["userId"])
@Index(["tokenHash"], { unique: true })
@Index(["expiresAt"])
export class Session extends BaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, (user) => user.sessions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    name: "token_hash",
    comment: "Hashed session token",
  })
  tokenHash!: string;

  @Column({
    type: "jsonb",
    name: "device_info",
    comment: "Device information (browser, OS, etc.)",
  })
  deviceInfo!: {
    browser?: string;
    os?: string;
    device?: string;
    fingerprint: string;
  };

  @Column({
    type: "varchar",
    length: 45,
    name: "ip_address",
  })
  ipAddress!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    comment: "Geographic location (city, country)",
  })
  location?: string;

  @Column({
    type: "text",
    name: "user_agent",
  })
  userAgent!: string;

  @Column({
    type: "timestamp with time zone",
    name: "last_activity",
    default: () => "CURRENT_TIMESTAMP",
  })
  lastActivity!: Date;

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
  })
  expiresAt!: Date;

  @Column({
    type: "boolean",
    default: true,
    name: "is_active",
  })
  isActive!: boolean;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "refresh_token_hash",
    comment: "Hashed refresh token",
  })
  refreshTokenHash?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "revoked_at",
  })
  revokedAt?: Date;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "revoked_reason",
  })
  revokedReason?: string;
}

import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

/**
 * Session Entity (UPDATED FOR MULTI-TENANT)
 */
@Entity("sessions")
@Index(["tenantId", "userId"]) // ← Add tenant index
@Index(["tenantId", "refreshTokenHash"]) // ← Add tenant index
@Index(["tenantId", "revokedAt"]) // ← Add tenant index
@Index(["tokenHash"], { unique: true })
@Index(["expiresAt", "revokedAt"]) // ← Composite index for cleanup query performance
@Index(["refreshTokenFamilyId"]) // ← Add this index
export class Session extends BaseEntity {
  // ✅ ADD THIS - Tenant ID (denormalized for performance)
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

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
    nullable: true,
  })
  tokenHash!: string;

  // Hashed access token — never store raw JWTs
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "access_token_hash",
    comment: "SHA-256 hash of the last issued access token",
  })
  accessTokenHash?: string;

  // ✅ ADD THIS - For refresh token rotation
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "refresh_token_hash",
    comment: "Hashed refresh token",
  })
  refreshTokenHash?: string;

  // Expiry of the current refresh token (updated on every rotation)
  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "refresh_expires_at",
    comment: "Expiry of the active refresh token",
  })
  refreshExpiresAt?: Date;

  // ✅ ADD THIS - For token rotation + reuse detection
  @Column({
    type: "uuid",
    nullable: true,
    name: "refresh_token_family_id",
    comment: "Token family for rotation tracking",
  })
  refreshTokenFamilyId?: string;

  // ✅ ADD THIS - Device identifier
  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "device_id",
    comment: "Unique device identifier",
  })
  deviceId?: string;

  @Column({
    type: "jsonb",
    name: "device_info",
    comment: "Device information (browser, OS, etc.)",
    nullable: true,
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

  // Timestamp updated specifically when a refresh token rotation occurs
  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_used_at",
    comment: "Set to NOW() on every successful refresh token rotation",
  })
  lastUsedAt?: Date;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_refresh_at",
  })
  lastRefreshAt?: Date;

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
  })
  expiresAt!: Date;

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

  @Column({
    type: "uuid",
    nullable: true,
    name: "application_id",
    comment: "OAuth client that initiated this session (nullable)",
  })
  applicationId?: string;
}

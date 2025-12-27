import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { MfaSettings } from "./mfa-settings.entity";
import { Session } from "./session.entity";

/**
 * User Entity
 *
 * Core user entity with comprehensive security features:
 * - Argon2id password hashing
 * - Email/phone verification
 * - Password history
 * - Account lockout
 * - Multi-tenant support
 */
@Entity("users")
@Index(["email", "tenantId"], { unique: true })
@Index(["tenantId"])
@Index(["status"])
@Index(["emailVerified"])
@Index(["lastLoginAt"])
export class User extends BaseEntity {
  // Tenant relation
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  // Basic Information
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({
    type: "boolean",
    default: false,
    name: "email_verified",
  })
  emailVerified!: boolean;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  phone?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "phone_verified",
  })
  phoneVerified!: boolean;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "first_name",
  })
  firstName?: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "last_name",
  })
  lastName?: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "display_name",
  })
  displayName?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "avatar_url",
  })
  avatarUrl?: string;

  // Password & Security
  @Column({
    type: "varchar",
    length: 255,
    name: "password_hash",
    select: false, // Don't select by default
  })
  passwordHash!: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "password_changed_at",
  })
  passwordChangedAt?: Date;

  @Column({
    type: "boolean",
    default: false,
    name: "force_password_change",
  })
  forcePasswordChange!: boolean;

  @Column({
    type: "jsonb",
    default: [],
    name: "password_history",
    comment: "Last 5 password hashes to prevent reuse",
  })
  passwordHistory!: string[];

  // After existing status field, add:

  @Column({
    type: "varchar",
    length: 50,
    default: "active",
    comment: "User account status",
  })
  status!: "active" | "inactive" | "suspended" | "deleted";

  // After password fields, make sure you have:

  @Column({
    type: "int",
    default: 0,
    name: "failed_login_attempts",
  })
  failedLoginAttempts!: number;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "locked_until",
  })
  lockedUntil?: Date;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_login_at",
  })
  lastLoginAt?: Date;

  @Column({
    type: "inet",
    nullable: true,
    name: "last_login_ip",
  })
  lastLoginIp?: string;

  // Verification Tokens
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "email_verification_token",
    select: false,
  })
  emailVerificationToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "email_verification_expires_at",
  })
  emailVerificationExpiresAt?: Date;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "password_reset_token",
    select: false,
  })
  passwordResetToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "password_reset_expires_at",
  })
  passwordResetExpiresAt?: Date;

  // Metadata
  @Column({
    type: "jsonb",
    default: {},
    comment: "Additional user metadata",
  })
  metadata?: Record<string, any>;

  @Column({
    type: "varchar",
    length: 10,
    nullable: true,
    comment: "User timezone (e.g., America/New_York)",
  })
  timezone?: string;

  @Column({
    type: "varchar",
    length: 10,
    default: "en",
    comment: "User preferred language",
  })
  language!: string;

  // Relations
  @OneToOne(() => MfaSettings, (mfa) => mfa.user, {
    cascade: true,
  })
  mfaSettings?: MfaSettings;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];
}

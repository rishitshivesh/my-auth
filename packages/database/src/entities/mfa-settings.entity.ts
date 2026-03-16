import {
  Entity,
  Column,
  Index,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";

/**
 * MFA Settings Entity (UPDATED FOR MULTI-TENANT)
 */
@Entity("mfa_settings")
@Index(["tenantId", "userId"], { unique: true }) // ← Add tenant index
export class MfaSettings extends BaseEntity {
  // ✅ ADD THIS - Tenant ID
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({ type: "uuid", name: "user_id", unique: false }) // ← Change to false
  userId!: string;

  @OneToOne(() => User, (user) => user.mfaSettings, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

  // ... rest of the fields (keep as is)

  // TOTP Settings
  @Column({
    type: "boolean",
    default: false,
    name: "totp_enabled",
  })
  totpEnabled!: boolean;

  @Column({
    type: "text",
    nullable: true,
    name: "totp_secret",
    select: false,
    comment: "Encrypted TOTP secret",
  })
  totpSecret?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "totp_verified_at",
  })
  totpVerifiedAt?: Date;

  // SMS Settings
  @Column({
    type: "boolean",
    default: false,
    name: "sms_enabled",
  })
  smsEnabled!: boolean;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
    name: "sms_phone",
  })
  smsPhone?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "sms_verified_at",
  })
  smsVerifiedAt?: Date;

  // Email Settings
  @Column({
    type: "boolean",
    default: false,
    name: "email_enabled",
  })
  emailEnabled!: boolean;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "email_verified_at",
  })
  emailVerifiedAt?: Date;

  // WebAuthn Settings
  @Column({
    type: "boolean",
    default: false,
    name: "webauthn_enabled",
  })
  webauthnEnabled!: boolean;

  // Backup Codes
  @Column({
    type: "jsonb",
    default: [],
    name: "backup_codes",
    select: false,
    comment: "Hashed backup codes",
  })
  backupCodes!: string[];

  @Column({
    type: "jsonb",
    default: [],
    name: "backup_codes_used",
    comment: "Used backup codes (hashed)",
  })
  backupCodesUsed!: string[];

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "backup_codes_generated_at",
  })
  backupCodesGeneratedAt?: Date;

  // MFA Enforcement
  @Column({
    type: "boolean",
    default: false,
    name: "mfa_required",
    comment: "Whether MFA is required for this user",
  })
  mfaRequired!: boolean;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
    name: "preferred_method",
    comment: "Preferred MFA method (totp, sms, email, webauthn)",
  })
  preferredMethod?: "totp" | "sms" | "email" | "webauthn";
}

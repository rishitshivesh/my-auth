import { Entity, Column, OneToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

/**
 * MFA Settings Entity
 *
 * Manages multi-factor authentication settings for users:
 * - TOTP (Google Authenticator)
 * - SMS OTP
 * - Email OTP
 * - WebAuthn/FIDO2
 * - Backup codes
 */
@Entity("mfa_settings")
export class MfaSettings extends BaseEntity {
  @Column({ type: "uuid", name: "user_id", unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.mfaSettings, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

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

  @Column({
    type: "jsonb",
    default: [],
    name: "webauthn_credentials",
    comment: "Registered WebAuthn/FIDO2 credentials",
  })
  webauthnCredentials!: Array<{
    id: string;
    publicKey: string;
    counter: number;
    deviceName?: string;
    createdAt: Date;
  }>;

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

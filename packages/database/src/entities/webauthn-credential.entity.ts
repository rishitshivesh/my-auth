import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";

/**
 * WebAuthn Credential Entity
 *
 * Stores registered FIDO2/passkey credentials for users.
 * One row per credential (device). Replaces the jsonb[] column
 * that previously lived on mfa_settings.
 */
@Entity("webauthn_credentials")
@Index(["tenantId", "credentialId"], { unique: true })
export class WebAuthnCredential {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  /** Base64URL-encoded credential ID as returned by the authenticator */
  @Column({ type: "text", name: "credential_id" })
  credentialId!: string;

  /** Raw COSE public-key bytes */
  @Column({ type: "bytea", name: "public_key" })
  publicKey!: Buffer;

  @Column({ type: "integer", name: "counter", default: 0 })
  counter!: number;

  @Column({ type: "varchar", length: 255, name: "device_name", nullable: true })
  deviceName?: string;

  @Column({ type: "text", array: true, name: "transports", nullable: true })
  transports?: string[];

  @Column({
    type: "timestamp with time zone",
    name: "last_used_at",
    nullable: true,
  })
  lastUsedAt?: Date;

  @CreateDateColumn({
    type: "timestamp with time zone",
    name: "created_at",
  })
  createdAt!: Date;
}

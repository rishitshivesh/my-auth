import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  Index,
} from "typeorm";

@Entity("key_pairs")
@Index(["tenantId", "status"])
export class KeyPair {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  kid!: string;

  @Column({ name: "tenant_id", type: "uuid", nullable: true })
  tenantId!: string | null;

  @Column({ default: "RS256" })
  algorithm!: string;

  @Column({ default: "sig" })
  use!: string;

  @Column({ name: "public_key_pem", type: "text" })
  publicKeyPem!: string;

  @Column({ name: "encrypted_private_key", type: "text" })
  encryptedPrivateKey!: string;

  @Column({ name: "iv", type: "text" })
  iv!: string;

  @Column({ name: "auth_tag", type: "text" })
  authTag!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "active",
  })
  status!: "active" | "retired" | "revoked";

  @CreateDateColumn({ name: "created_at", type: "timestamp with time zone" })
  createdAt!: Date;

  @Column({ name: "expires_at", type: "timestamp with time zone" })
  expiresAt!: Date;

  @Column({
    name: "retired_at",
    type: "timestamp with time zone",
    nullable: true,
  })
  retiredAt!: Date | null;

  @Column({
    name: "revoked_at",
    type: "timestamp with time zone",
    nullable: true,
  })
  revokedAt!: Date | null;
}

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { type SocialProvider } from "./user-social-connections.entity";

@Entity("social_link_requests")
@Index(["token"], { unique: true })
@Index(["tenantId", "userId"])
export class SocialLinkRequest extends BaseEntity {
  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  // ============================================================
  // REQUEST DATA
  // ============================================================

  @Column({
    type: "varchar",
    length: 50,
  })
  provider!: SocialProvider;

  @Column({
    type: "varchar",
    length: 255,
    name: "provider_id",
  })
  providerId!: string;

  @Column({
    type: "varchar",
    length: 255,
    name: "provider_email",
  })
  providerEmail!: string;

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    comment: "Verification token sent via email",
  })
  token!: string;

  @Column({
    type: "jsonb",
    comment: "Social profile data to be linked",
  })
  profileData!: {
    displayName?: string;
    avatarUrl?: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    scopes?: string;
    metadata?: Record<string, any>;
  };

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
    comment: "When this request expires",
  })
  expiresAt!: Date;

  @Column({
    type: "boolean",
    default: false,
    comment: "Has this request been completed?",
  })
  completed!: boolean;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "completed_at",
  })
  completedAt?: Date;

  @Column({
    type: "inet",
    nullable: true,
    name: "ip_address",
  })
  ipAddress?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "user_agent",
  })
  userAgent?: string;

  // ============================================================
  // HELPERS
  // ============================================================

  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  get isValid(): boolean {
    return !this.completed && !this.isExpired;
  }
}

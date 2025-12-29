import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

export type SocialProvider =
  | "google"
  | "github"
  | "microsoft"
  | "apple"
  | "linkedin"
  | "facebook";

@Entity("user_social_connections")
@Index(["tenantId", "userId"])
@Index(["tenantId", "provider", "providerId"], { unique: true })
@Index(["email"])
export class UserSocialConnection extends BaseEntity {
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

  @ManyToOne(() => User, (user) => user.socialConnections, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

  // ============================================================
  // PROVIDER INFORMATION
  // ============================================================

  @Column({
    type: "varchar",
    length: 50,
    comment: "Social provider (google, github, etc.)",
  })
  provider!: SocialProvider;

  @Column({
    type: "varchar",
    length: 255,
    name: "provider_id",
    comment: "User ID at the provider",
  })
  providerId!: string;

  @Column({
    type: "varchar",
    length: 255,
    comment: "Email from provider",
  })
  email!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "display_name",
    comment: "Display name from provider",
  })
  displayName?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "avatar_url",
    comment: "Avatar URL from provider",
  })
  avatarUrl?: string;

  // ============================================================
  // TOKENS (ENCRYPTED)
  // ============================================================

  @Column({
    type: "text",
    nullable: true,
    name: "access_token",
    comment: "Encrypted access token",
    select: false,
  })
  accessToken?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "refresh_token",
    comment: "Encrypted refresh token",
    select: false,
  })
  refreshToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "token_expires_at",
    comment: "When access token expires",
  })
  tokenExpiresAt?: Date;

  @Column({
    type: "text",
    nullable: true,
    comment: "Granted scopes (space-separated)",
  })
  scopes?: string;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Provider-specific metadata",
  })
  metadata?: Record<string, any>;

  @Column({
    type: "boolean",
    default: false,
    comment: "Is this the primary auth method?",
  })
  primary!: boolean;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_used_at",
    comment: "When this connection was last used to login",
  })
  lastUsedAt?: Date;

  // ============================================================
  // HELPERS
  // ============================================================

  get isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt < new Date();
  }

  get scopesList(): string[] {
    if (!this.scopes) return [];
    return this.scopes.split(" ").filter(Boolean);
  }
}

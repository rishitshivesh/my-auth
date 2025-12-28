import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { OAuthClient } from "./oauth-client.entity";
import { User } from "./user.entity";
import { OAuthAccessToken } from "./oauth-access-token.entity";

/**
 * OAuth2 Refresh Token
 * Long-lived token for getting new access tokens
 * Implements token rotation and family tracking
 */
@Entity("oauth_refresh_tokens")
@Index(["tenantId", "tokenHash"], { unique: true })
@Index(["tenantId"])
@Index(["tokenHash"])
@Index(["clientId"])
@Index(["userId"])
@Index(["familyId"])
@Index(["parentTokenId"])
@Index(["expiresAt"])
@Index(["revokedAt"])
export class OAuthRefreshToken extends BaseEntity {
  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({ type: "uuid", name: "client_id" })
  clientId!: string;

  @ManyToOne(() => OAuthClient, (client) => client.refreshTokens, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "client_id" })
  client!: OAuthClient;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "uuid", nullable: true, name: "access_token_id" })
  accessTokenId?: string;

  @ManyToOne(() => OAuthAccessToken, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "access_token_id" })
  accessToken?: OAuthAccessToken;

  // ============================================================
  // TOKEN
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    name: "token_hash",
    comment: "SHA-256 hash of refresh token",
  })
  tokenHash!: string;

  // ============================================================
  // TOKEN FAMILY (Rotation & Reuse Detection)
  // ============================================================

  @Column({
    type: "uuid",
    name: "family_id",
    comment: "Token family ID for rotation tracking",
  })
  familyId!: string;

  @Column({
    type: "uuid",
    nullable: true,
    name: "parent_token_id",
    comment: "Previous token in rotation chain",
  })
  parentTokenId?: string;

  @ManyToOne(() => OAuthRefreshToken, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "parent_token_id" })
  parentToken?: OAuthRefreshToken;

  // ============================================================
  // OAUTH2 PARAMETERS
  // ============================================================

  @Column({
    type: "text",
    nullable: true,
    comment: "Granted scopes (space-separated)",
  })
  scope?: string;

  // ============================================================
  // USAGE & EXPIRY
  // ============================================================

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "used_at",
    comment: "When this token was used to get new tokens",
  })
  usedAt?: Date;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "revoked_at",
    comment: "When this token was revoked",
  })
  revokedAt?: Date;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "revoked_reason",
    comment: "Why this token was revoked",
  })
  revokedReason?: string;

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
    comment: "When this token expires (typically 7 days)",
  })
  expiresAt!: Date;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "inet",
    nullable: true,
    name: "ip_address",
    comment: "IP address when token was issued",
  })
  ipAddress?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "user_agent",
    comment: "User agent when token was issued",
  })
  userAgent?: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "device_id",
    comment: "Device identifier",
  })
  deviceId?: string;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Check if token is expired
   */
  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  /**
   * Check if token is revoked
   */
  get isRevoked(): boolean {
    return !!this.revokedAt;
  }

  /**
   * Check if token has been used (for reuse detection)
   */
  get isUsed(): boolean {
    return !!this.usedAt;
  }

  /**
   * Check if token is valid (not expired, not revoked, not used)
   */
  get isValid(): boolean {
    return !this.isExpired && !this.isRevoked && !this.isUsed;
  }

  /**
   * Get scopes as array
   */
  get scopes(): string[] {
    return this.scope ? this.scope.split(" ") : [];
  }

  /**
   * Check if token has specific scope
   */
  hasScope(scope: string): boolean {
    return this.scopes.includes(scope);
  }

  /**
   * Check if this is the root token in family
   */
  get isRootToken(): boolean {
    return !this.parentTokenId;
  }
}

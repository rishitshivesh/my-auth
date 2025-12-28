import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { OAuthClient } from "./oauth-client.entity";
import { User } from "./user.entity";
import { Session } from "./session.entity";

/**
 * OAuth2 Access Token
 * Short-lived token for API access
 */
@Entity("oauth_access_tokens")
@Index(["tenantId", "tokenHash"], { unique: true })
@Index(["tenantId"])
@Index(["tokenHash"])
@Index(["clientId"])
@Index(["userId"])
@Index(["sessionId"])
@Index(["expiresAt"])
@Index(["revokedAt"])
export class OAuthAccessToken extends BaseEntity {
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

  @ManyToOne(() => OAuthClient, (client) => client.accessTokens, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "client_id" })
  client!: OAuthClient;

  @Column({ type: "uuid", nullable: true, name: "user_id" })
  userId?: string; // NULL for client_credentials grant

  @ManyToOne(() => User, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "uuid", nullable: true, name: "session_id" })
  sessionId?: string;

  @ManyToOne(() => Session, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "session_id" })
  session?: Session;

  // ============================================================
  // TOKEN
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    name: "token_hash",
    comment: "SHA-256 hash of access token (JTI claim)",
  })
  tokenHash!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "Bearer",
    name: "token_type",
    comment: "Token type (always Bearer)",
  })
  tokenType!: string;

  // ============================================================
  // OAUTH2 PARAMETERS
  // ============================================================

  @Column({
    type: "text",
    nullable: true,
    comment: "Granted scopes (space-separated)",
  })
  scope?: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Audience (client_id or resource server)",
  })
  audience?: string;

  // ============================================================
  // EXPIRY & REVOCATION
  // ============================================================

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
    comment: "When this token expires (typically 15 minutes)",
  })
  expiresAt!: Date;

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

  // ============================================================
  // USAGE TRACKING
  // ============================================================

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_used_at",
    comment: "Last time this token was used",
  })
  lastUsedAt?: Date;

  @Column({
    type: "integer",
    default: 0,
    name: "use_count",
    comment: "Number of times this token was used",
  })
  useCount!: number;

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
   * Check if token is valid (not expired, not revoked)
   */
  get isValid(): boolean {
    return !this.isExpired && !this.isRevoked;
  }

  /**
   * Check if token is for a user (vs M2M)
   */
  get isUserToken(): boolean {
    return !!this.userId;
  }

  /**
   * Check if token is for M2M
   */
  get isM2MToken(): boolean {
    return !this.userId;
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
}

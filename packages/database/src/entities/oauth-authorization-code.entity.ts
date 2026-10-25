import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { OAuthClient } from "./oauth-client.entity";
import { User } from "./user.entity";

/**
 * OAuth2 Authorization Code
 * Temporary code exchanged for access/refresh tokens
 */
@Entity("oauth_authorization_codes")
@Index(["tenantId", "codeHash"], { unique: true })
@Index(["tenantId"])
@Index(["codeHash"])
@Index(["clientId"])
@Index(["userId"])
@Index(["expiresAt"])
export class OAuthAuthorizationCode extends BaseEntity {
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

  @ManyToOne(() => OAuthClient, (client) => client.authorizationCodes, {
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

  // ============================================================
  // CODE
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    name: "code_hash",
    comment: "SHA-256 hash of authorization code",
  })
  codeHash!: string;

  // ============================================================
  // PKCE (Proof Key for Code Exchange)
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "code_challenge",
    comment: "PKCE code challenge",
  })
  codeChallenge?: string;

  @Column({
    type: "varchar",
    length: 10,
    nullable: true,
    name: "code_challenge_method",
    comment: "PKCE challenge method: S256 or plain",
  })
  codeChallengeMethod?: "S256" | "plain";

  // ============================================================
  // OAUTH2 PARAMETERS
  // ============================================================

  @Column({
    type: "varchar",
    length: 500,
    name: "redirect_uri",
    comment: "Redirect URI used in authorization request",
  })
  redirectUri!: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Requested scopes (space-separated)",
  })
  scope?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    comment: "OAuth2 state parameter for CSRF protection",
  })
  state?: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    comment: "OIDC nonce parameter for replay protection",
  })
  nonce?: string;

  // ============================================================
  // AUTHENTICATION CONTEXT (OIDC sid / auth_time / amr)
  // ============================================================

  @Column({
    type: "uuid",
    nullable: true,
    name: "session_id",
    comment: "Browser session that authorised this code (ID token sid)",
  })
  sessionId?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "auth_time",
    comment: "When the session's user last authenticated (ID token auth_time)",
  })
  authTime?: Date;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    comment: "Space-separated authentication methods (ID token amr)",
  })
  amr?: string;

  // ============================================================
  // USAGE TRACKING
  // ============================================================

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "used_at",
    comment: "When this code was exchanged for tokens",
  })
  usedAt?: Date;

  @Column({
    type: "timestamp with time zone",
    name: "expires_at",
    comment: "When this code expires (typically 10 minutes)",
  })
  expiresAt!: Date;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "inet",
    nullable: true,
    name: "ip_address",
    comment: "IP address of authorization request",
  })
  ipAddress?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "user_agent",
    comment: "User agent of authorization request",
  })
  userAgent?: string;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Check if code is expired
   */
  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  /**
   * Check if code has been used
   */
  get isUsed(): boolean {
    return !!this.usedAt;
  }

  /**
   * Check if code is valid (not expired, not used)
   */
  get isValid(): boolean {
    return !this.isExpired && !this.isUsed;
  }

  /**
   * Check if PKCE is enabled
   */
  get hasPKCE(): boolean {
    return !!this.codeChallenge;
  }
}

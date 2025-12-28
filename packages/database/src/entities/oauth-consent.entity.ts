import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { OAuthClient } from "./oauth-client.entity";
import { User } from "./user.entity";

/**
 * OAuth2 Consent
 * User consent for third-party applications
 */
@Entity("oauth_consents")
@Index(["tenantId", "userId", "clientId"], { unique: true })
@Index(["tenantId"])
@Index(["clientId"])
@Index(["userId"])
@Index(["expiresAt"])
@Index(["revokedAt"])
export class OAuthConsent extends BaseEntity {
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

  @ManyToOne(() => OAuthClient, (client) => client.consents, {
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
  // CONSENT
  // ============================================================

  @Column({
    type: "simple-array",
    name: "granted_scopes",
    comment: "Scopes the user consented to",
  })
  grantedScopes!: string[];

  // ============================================================
  // EXPIRY & REVOCATION
  // ============================================================

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "expires_at",
    comment: "When this consent expires (NULL = permanent)",
  })
  expiresAt?: Date;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "revoked_at",
    comment: "When this consent was revoked",
  })
  revokedAt?: Date;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "revoked_reason",
    comment: "Why this consent was revoked",
  })
  revokedReason?: string;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "inet",
    nullable: true,
    name: "ip_address",
    comment: "IP address when consent was granted",
  })
  ipAddress?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "user_agent",
    comment: "User agent when consent was granted",
  })
  userAgent?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "remember_consent",
    comment: "Whether user chose to remember this consent",
  })
  rememberConsent!: boolean;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Check if consent is expired
   */
  get isExpired(): boolean {
    if (!this.expiresAt) return false; // Permanent consent
    return this.expiresAt < new Date();
  }

  /**
   * Check if consent is revoked
   */
  get isRevoked(): boolean {
    return !!this.revokedAt;
  }

  /**
   * Check if consent is valid (not expired, not revoked)
   */
  get isValid(): boolean {
    return !this.isExpired && !this.isRevoked;
  }

  /**
   * Check if user consented to specific scope
   */
  hasScope(scope: string): boolean {
    return this.grantedScopes.includes(scope);
  }

  /**
   * Check if user consented to all requested scopes
   */
  hasAllScopes(scopes: string[]): boolean {
    return scopes.every((scope) => this.hasScope(scope));
  }

  /**
   * Check if consent is permanent
   */
  get isPermanent(): boolean {
    return !this.expiresAt;
  }
}

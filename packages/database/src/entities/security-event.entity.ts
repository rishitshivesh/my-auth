import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";

/**
 * Typed event-type constants.
 * All callers MUST use these instead of raw string literals so the
 * event_type column stays in a well-known, consistent format.
 */
export const SecurityEventType = {
  // Auth
  LOGIN_SUCCESS: "auth.login_success",
  LOGIN_FAILED: "auth.login_failed",
  LOGOUT: "auth.logout",
  TOKEN_REFRESHED: "auth.token_refreshed",
  TOKEN_ROTATION_FAILED: "auth.token_rotation_failed",
  MFA_CHALLENGE_SENT: "auth.mfa_challenge_sent",
  // Registration
  USER_REGISTERED: "user.registered",
  REGISTRATION_FAILED: "user.registration_failed",
  EMAIL_VERIFIED: "user.email_verified",
  // Password
  PASSWORD_RESET_REQUESTED: "password.reset_requested",
  PASSWORD_RESET_COMPLETED: "password.reset_completed",
  PASSWORD_CHANGED: "password.changed",
  PASSWORD_CHANGE_FAILED: "password.change_failed",
  // User management
  USER_UPDATED: "user.updated",
  USER_ACTIVATED: "user.activated",
  USER_DEACTIVATED: "user.deactivated",
  USER_LOCKED: "user.locked",
  USER_DELETED: "user.deleted",
  USER_DELETION_FAILED: "user.deletion_failed",
  USER_INVITE_REVOKED: "user.invite_revoked",
  // Sessions
  SESSION_REVOKED: "session.revoked",
  ALL_SESSIONS_REVOKED: "session.all_revoked",
  SESSION_EXPIRED_CLEANUP: "session.expired_cleanup",
  // Social auth
  SOCIAL_LOGIN_SUCCESS: "social.login_success",
  SOCIAL_USER_CREATED: "social.user_created",
  SOCIAL_ACCOUNT_LINKED: "social.account_linked",
  SOCIAL_ACCOUNT_UNLINKED: "social.account_unlinked",
  // WebAuthn / passkey
  PASSKEY_REGISTERED: "passkey.registered",
  PASSKEY_REMOVED: "passkey.removed",
  PASSKEY_AUTH_SUCCESS: "passkey.auth_success",
  PASSKEY_AUTH_FAILED: "passkey.auth_failed",
  // MFA
  TOTP_ENABLED: "mfa.totp_enabled",
  TOTP_DISABLED: "mfa.totp_disabled",
  // Session / account protection
  SESSION_REFRESH_REUSE_DETECTED: "session.refresh_reuse_detected",
  PASSKEY_CLONED: "passkey.cloned",
  ACCOUNT_LOCKED: "account.locked",
  OWNERSHIP_TRANSFERRED: "tenant.ownership_transferred",
  // Brute force
  BRUTE_FORCE_THRESHOLD: "security.brute_force_threshold",
  // Email
  EMAIL_SENT: "email.sent",
  // RBAC
  ROLE_CREATED: "rbac.role_created",
  ROLE_DELETED: "rbac.role_deleted",
  ROLE_ASSIGNED: "rbac.role_assigned",
  ROLE_REMOVED: "rbac.role_removed",
  // LDAP directory sync
  LDAP_USER_DEACTIVATED: "ldap.user_deactivated",
  LDAP_USER_REACTIVATED: "ldap.user_reactivated",
  LDAP_SYNC_ABORTED: "ldap.sync_aborted",
  // Branding / settings
  BRANDING_UPDATED: "branding.updated",
  TENANT_SETTINGS_UPDATED: "tenant.settings_updated",
} as const;

export type SecurityEventType =
  (typeof SecurityEventType)[keyof typeof SecurityEventType];

/**
 * Security Event Entity
 *
 * Logs all security-related events:
 * - Login attempts (success/failure)
 * - Password changes
 * - MFA events
 * - Account lockouts
 * - Suspicious activities
 *
 * Audit logs survive user AND tenant deletion:
 * - user FK:   ON DELETE SET NULL  (already set)
 * - tenant FK: ON DELETE SET NULL  (changed from CASCADE)
 */
@Entity("security_events")
@Index(["userId"])
@Index(["tenantId"])
@Index(["eventType"])
@Index(["severity"])
@Index(["createdAt"])
@Index(["ipAddress"])
@Index(["requestId"])
export class SecurityEvent extends BaseEntity {
  @Column({ type: "uuid", nullable: true, name: "user_id" })
  userId?: string;

  @ManyToOne(() => User, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "uuid", nullable: true, name: "tenant_id" })
  tenantId?: string;

  // ON DELETE SET NULL — audit logs must survive tenant deletion for compliance.
  @ManyToOne(() => Tenant, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant?: Tenant;

  @Column({
    type: "varchar",
    length: 100,
    name: "event_type",
  })
  eventType!: string;

  @Column({
    type: "enum",
    enum: ["info", "medium", "warning", "high", "critical"],
    default: "info",
  })
  severity!: "info" | "medium" | "warning" | "high" | "critical";

  @Column({
    type: "varchar",
    length: 45,
    name: "ip_address",
  })
  ipAddress!: string;

  @Column({
    type: "text",
    name: "user_agent",
  })
  userAgent!: string;

  @Column({
    type: "jsonb",
    nullable: true,
    name: "device_info",
  })
  deviceInfo?: Record<string, any>;

  @Column({
    type: "jsonb",
    default: {},
    comment: "Additional event metadata — sensitive keys are stripped before write",
  })
  metadata!: Record<string, any>;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    comment: "Geographic location",
  })
  location?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "is_anomaly",
    comment: "Whether this event was flagged as anomalous",
  })
  isAnomaly!: boolean;

  // ── New audit fields (Problem 2) ────────────────────────────────────────

  /**
   * Denormalized copy of the actor's email at the time of the event.
   * Survives user deletion — never join back to users to retrieve this.
   */
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "actor_email",
    comment: "Denormalized actor email at event time — survives user deletion",
  })
  actorEmail?: string;

  /**
   * OAuth application that triggered this event.
   * FK to oauth_clients; set to NULL if the client is deleted.
   */
  @Column({
    type: "uuid",
    nullable: true,
    name: "application_id",
    comment: "OAuth client (application) that triggered this event",
  })
  applicationId?: string;

  /**
   * ID of the affected entity (session ID, API key ID, user ID being modified, etc.).
   */
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "resource_id",
    comment: "ID of the affected entity",
  })
  resourceId?: string;

  /**
   * Type of the affected entity: 'session', 'user', 'api_key', etc.
   */
  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
    name: "resource_type",
    comment: "Type of the affected entity",
  })
  resourceType?: string;

  /** Correlation id of the HTTP request that produced this event. */
  @Column({
    type: "varchar",
    length: 64,
    nullable: true,
    name: "request_id",
    comment: "x-request-id of the originating request",
  })
  requestId?: string;

  @Column({
    type: "varchar",
    length: 16,
    default: "success",
    name: "outcome",
    comment: "success | failure",
  })
  outcome!: "success" | "failure";
}

import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { MfaSettings } from "./mfa-settings.entity";
import { Session } from "./session.entity";
import { Role } from "./role.entity";
import { UserRole } from "./user-role.entity";
import { UserSocialConnection } from "./user-social-connections.entity";

@Entity("users")
@Index(["tenantId", "email"], { unique: true })
@Index(["email"])
@Index(["tenantId"])
@Index(["status"])
@Index(["emailVerified"])
@Index(["lastLoginAt"])
export class User extends BaseEntity {
  // Tenant relation
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  // Basic Information
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({
    type: "boolean",
    default: false,
    name: "email_verified",
  })
  emailVerified!: boolean;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  phone?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "phone_verified",
  })
  phoneVerified!: boolean;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "first_name",
  })
  firstName?: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "last_name",
  })
  lastName?: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "display_name",
  })
  displayName?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "avatar_url",
  })
  avatarUrl?: string;

  // Password & Security
  @Column({
    type: "varchar",
    length: 255,
    name: "password_hash",
    select: false,
    nullable: true,
  })
  passwordHash?: string;

  @Column({
    type: "varchar",
    length: 50,
    default: "password",
    name: "primary_auth_method",
    comment: "Primary authentication method",
  })
  primaryAuthMethod!:
    | "password"
    | "google"
    | "github"
    | "microsoft"
    | "apple"
    | "linkedin"
    | "facebook";

  @OneToMany(() => UserSocialConnection, (connection) => connection.user, {
    lazy: true,
  })
  socialConnections!: Promise<UserSocialConnection[]>;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "password_changed_at",
  })
  passwordChangedAt?: Date;

  @Column({
    type: "boolean",
    default: false,
    name: "force_password_change",
  })
  forcePasswordChange!: boolean;

  @Column({
    type: "jsonb",
    default: [],
    name: "password_history",
    comment: "Last 5 password hashes to prevent reuse",
  })
  passwordHistory!: string[];

  @Column({
    type: "varchar",
    length: 50,
    default: "active",
    comment: "User account status",
  })
  status!: "active" | "inactive" | "suspended" | "deleted";

  @Column({
    type: "int",
    default: 0,
    name: "failed_login_attempts",
  })
  failedLoginAttempts!: number;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_failed_login",
  })
  lastFailedLogin?: Date | null;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "locked_until",
  })
  lockedUntil?: Date | null;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "last_login_at",
  })
  lastLoginAt?: Date;

  @Column({
    type: "inet",
    nullable: true,
    name: "last_login_ip",
  })
  lastLoginIp?: string;

  // Verification Tokens
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "email_verification_token",
    select: false,
  })
  emailVerificationToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "email_verification_expires_at",
  })
  emailVerificationExpiresAt?: Date;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "password_reset_token",
    select: false,
  })
  passwordResetToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "password_reset_expires",
  })
  passwordResetExpiresAt?: Date;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "magic_link_token",
    select: false,
    comment: "SHA-256 hash of the magic link token",
  })
  magicLinkToken?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "magic_link_expires_at",
  })
  magicLinkExpiresAt?: Date;

  @Column({
    type: "jsonb",
    default: {},
    comment: "Additional user metadata",
  })
  metadata?: Record<string, string | number | boolean | null>;

  @Column({
    type: "varchar",
    length: 10,
    nullable: true,
    comment: "User timezone (e.g., America/New_York)",
  })
  timezone?: string;

  @Column({
    type: "boolean",
    default: true,
    name: "is_active",
  })
  isActive!: boolean;

  // Relationships
  @OneToOne(() => MfaSettings, (mfa) => mfa.user, { cascade: true })
  mfaSettings?: MfaSettings;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];

  // ============================================================
  // RBAC RELATIONSHIPS - NEW
  // ============================================================

  // Many-to-Many via explicit UserRole entity
  // NO @JoinTable - we have explicit UserRole entity with metadata
  @ManyToMany(() => Role, (role) => role.users)
  roles!: Role[];

  // OneToMany to access join table metadata
  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles!: UserRole[];

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'preferred_auth_method',
    comment: 'User preferred authentication method',
  })
  preferredAuthMethod?:
    | 'password'
    | 'magicLink'
    | 'passkey'
    | 'social';

  // ⭐ NEW: MFA enabled flag
  @Column({
    type: 'boolean',
    default: false,
    name: 'mfa_enabled',
    comment: 'Whether user has enabled MFA',
  })
  mfaEnabled!: boolean;

  // ============================================================
  // RBAC HELPER METHODS - NEW
  // ============================================================

  /**
   * Check if user has a specific role
   */
  hasRole(roleName: string): boolean {
    if (!this.roles) {
      return false;
    }
    return this.roles.some((role) => role.name === roleName);
  }

  /**
   * Check if user has any of the roles
   */
  hasAnyRole(roleNames: string[]): boolean {
    return roleNames.some((name) => this.hasRole(name));
  }

  /**
   * Check if user has all roles
   */
  hasAllRoles(roleNames: string[]): boolean {
    return roleNames.every((name) => this.hasRole(name));
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(permissionName: string): boolean {
    if (!this.roles) {
      return false;
    }
    return this.roles.some((role) => role.hasPermission(permissionName));
  }

  /**
   * Check if user has any of the permissions
   */
  hasAnyPermission(permissionNames: string[]): boolean {
    return permissionNames.some((name) => this.hasPermission(name));
  }

  /**
   * Check if user has all permissions
   */
  hasAllPermissions(permissionNames: string[]): boolean {
    return permissionNames.every((name) => this.hasPermission(name));
  }

  /**
   * Get all permission names for this user
   */
  getPermissions(): string[] {
    if (!this.roles) {
      return [];
    }

    const permissions = new Set<string>();

    for (const role of this.roles) {
      const rolePermissions = role.getPermissionNames();
      rolePermissions.forEach((p) => permissions.add(p));
    }

    return Array.from(permissions);
  }

  /**
   * Get all role names for this user
   */
  getRoleNames(): string[] {
    if (!this.roles) {
      return [];
    }
    return this.roles.map((r) => r.name);
  }

  /**
   * Check if user is admin (has admin role or admin permissions)
   */
  get isAdmin(): boolean {
    if (!this.roles) {
      return false;
    }
    return this.roles.some((role) => role.isAdmin);
  }

  /**
   * Get highest priority role
   */
  get primaryRole(): Role | undefined {
    if (!this.roles || this.roles.length === 0) {
      return undefined;
    }
    return this.roles.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Check if user has expired role assignments
   */
  hasExpiredRoles(): boolean {
    if (!this.userRoles) {
      return false;
    }
    return this.userRoles.some((ur) => ur.isExpired);
  }

  // ============================================================
  // EXISTING HELPER METHODS
  // ============================================================

  get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.displayName || this.email;
  }

  get isLocked(): boolean {
    if (!this.lockedUntil) return false;
    return new Date() < this.lockedUntil;
  }
}

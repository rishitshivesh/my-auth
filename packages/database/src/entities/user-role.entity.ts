import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Role } from "./role.entity";

/**
 * UserRole Entity (Join Table)
 *
 * Explicit join table for User-Role many-to-many relationship.
 * Allows additional metadata like assignment date, expiry, etc.
 */
@Entity("user_roles")
@Unique(["userId", "roleId"])
@Index(["userId"])
@Index(["roleId"])
@Index(["tenantId"])
@Index(["expiresAt"])
export class UserRole extends BaseEntity {
  // PRIMARY KEY - must be explicitly marked
  // This tells TypeORM this is NOT a simple join table

  // ============================================================
  // TENANT RELATIONSHIP
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, (user) => user.userRoles, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;

  @ManyToOne(() => Role, (role) => role.users, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "role_id" })
  role!: Role;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "uuid",
    nullable: true,
    name: "assigned_by",
    comment: "User who assigned this role",
  })
  assignedBy?: string;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "assigned_at",
    default: () => "CURRENT_TIMESTAMP",
    comment: "When role was assigned",
  })
  assignedAt!: Date;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "expires_at",
    comment: "When role assignment expires (null = permanent)",
  })
  expiresAt?: Date;

  @Column({
    type: "text",
    nullable: true,
    comment: "Reason for assignment",
  })
  reason?: string;

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Additional metadata (conditions, restrictions, etc.)",
  })
  metadata?: {
    conditions?: string[];
    restrictions?: Record<string, string | number | boolean>;
    source?: string; // 'manual', 'auto', 'sso', etc.
  };

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Check if role assignment is expired
   */
  get isExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }
    return this.expiresAt < new Date();
  }

  /**
   * Check if role assignment is active
   */
  get isActive(): boolean {
    return !this.isExpired;
  }

  /**
   * Get days until expiry
   */
  get daysUntilExpiry(): number | null {
    if (!this.expiresAt) {
      return null;
    }
    const now = new Date();
    const diff = this.expiresAt.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if assignment is permanent
   */
  get isPermanent(): boolean {
    return !this.expiresAt;
  }
}

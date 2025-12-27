import { Entity, Column, Index, OneToMany } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

/**
 * Tenant Entity
 *
 * Represents an organization/tenant in the multi-tenant system.
 * Each tenant is isolated and has its own users, settings, and configuration.
 */
@Entity("tenants")
@Index(["subdomain"], { unique: true })
@Index(["customDomain"], { unique: true, where: "custom_domain IS NOT NULL" })
export class Tenant extends BaseEntity {
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({
    type: "varchar",
    length: 100,
    unique: true,
    name: "subdomain",
  })
  subdomain!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "custom_domain",
  })
  customDomain?: string;

  @Column({
    type: "enum",
    enum: ["active", "trial", "suspended", "cancelled"],
    default: "trial",
  })
  status!: "active" | "trial" | "suspended" | "cancelled";

  @Column({
    type: "enum",
    enum: ["free", "starter", "professional", "enterprise"],
    default: "free",
  })
  plan!: "free" | "starter" | "professional" | "enterprise";

  @Column({
    type: "jsonb",
    default: {},
    comment: "Tenant-specific configuration and settings",
  })
  settings!: Record<string, any>;

  @Column({
    type: "jsonb",
    default: {},
    comment: "Tenant branding configuration (logo, colors, etc.)",
  })
  branding?: Record<string, any>;

  @Column({
    type: "boolean",
    default: true,
    name: "is_active",
  })
  isActive!: boolean;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    name: "trial_ends_at",
  })
  trialEndsAt?: Date;

  @Column({
    type: "int",
    default: 0,
    name: "user_limit",
    comment: "Maximum number of users allowed (0 = unlimited)",
  })
  userLimit!: number;

  @Column({
    type: "int",
    default: 0,
    name: "user_count",
    comment: "Current number of users in tenant",
  })
  userCount!: number;

  @Column({
    type: "jsonb",
    default: {},
    name: "feature_flags",
    comment: "Feature flags for this tenant",
  })
  featureFlags!: Record<string, boolean>;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "contact_email",
  })
  contactEmail?: string;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
    name: "contact_phone",
  })
  contactPhone?: string;

  // Relations
  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];
}

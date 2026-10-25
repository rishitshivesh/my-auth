// packages/database/src/entities/tenant.entity.ts
import { Entity, Column, OneToMany, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { TenantSocialProvider } from "./tenant-social-providers.entity";

export interface TenantBrandingConfig {
  logoUrl?: string;          // Company logo URL
  faviconUrl?: string;        // Favicon URL
  primaryColor?: string;      // #0066FF
  backgroundColor?: string;   // #FFFFFF
  textColor?: string;         // #000000
  buttonColor?: string;       // #0066FF
  buttonTextColor?: string;   // #FFFFFF
  companyName?: string;       // Display name (can differ from tenant.name)
  supportEmail?: string;      // support@company.com
  privacyPolicyUrl?: string;  // https://company.com/privacy
  termsOfServiceUrl?: string; // https://company.com/terms
}

@Entity("tenants")
@Index(["slug"], { unique: true })
@Index(["customDomain"], { unique: true, where: "custom_domain IS NOT NULL" })
export class Tenant extends BaseEntity {
  @Column({ type: "varchar", length: 100, unique: true })
  slug!: string; // acme, startup, corp

  @Column({ type: "varchar", length: 255 })
  name!: string; // Acme Corp

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    unique: true,
    name: "custom_domain",
  })
  customDomain?: string; // auth.acme.com

  @Column({
    type: "boolean",
    default: false,
    name: "custom_domain_verified",
  })
  customDomainVerified!: boolean;

  @Column({
    type: "varchar",
    length: 100,
    default: "production",
  })
  environment!: string; // production, staging, development

  @Column({
    type: "jsonb",
    nullable: true,
    name: "feature_flags",
  })
  featureFlags?: Record<string, boolean>;

  @Column({
    type: "jsonb",
    nullable: true,
  })
  settings?: {
    allowSignup?: boolean;
    requireEmailVerification?: boolean;
    sessionTimeout?: number;
    mfaRequired?: boolean;
    /** Commercial plan label (there is no dedicated column). */
    plan?: string;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  branding?: TenantBrandingConfig;

  @Column({
    type: 'simple-array',
    nullable: true,
    name: 'allowed_origins',
    comment: 'Per-tenant allowed CORS origins',
  })
  allowedOrigins?: string[];

  @Column({
    type: "boolean",
    default: true,
  })
  active!: boolean;

  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];

  @OneToMany(() => TenantSocialProvider, (provider) => provider.tenant)
  socialProviders!: TenantSocialProvider[];
}

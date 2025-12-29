import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { type SocialProvider } from "./user-social-connections.entity";

@Entity("tenant_social_providers")
@Index(["tenantId", "provider"], { unique: true })
export class TenantSocialProvider extends BaseEntity {
  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  // ============================================================
  // PROVIDER CONFIGURATION
  // ============================================================

  @Column({
    type: "varchar",
    length: 50,
    comment: "Social provider",
  })
  provider!: SocialProvider;

  @Column({
    type: "boolean",
    default: false,
    comment: "Is this provider enabled for this tenant?",
  })
  enabled!: boolean;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "client_id",
    comment: "OAuth client ID (tenant-specific or shared)",
  })
  clientId?: string;

  @Column({
    type: "text",
    nullable: true,
    name: "client_secret",
    comment: "Encrypted OAuth client secret",
    select: false,
  })
  clientSecret?: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Requested scopes (space-separated)",
  })
  scopes?: string;

  @Column({
    type: "boolean",
    default: false,
    name: "use_shared_app",
    comment: "Use Fort Knox shared OAuth app?",
  })
  useSharedApp!: boolean;

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Provider-specific configuration",
  })
  config?: Record<string, any>;

  // ============================================================
  // HELPERS
  // ============================================================

  get scopesList(): string[] {
    if (!this.scopes) return [];
    return this.scopes.split(" ").filter(Boolean);
  }
}

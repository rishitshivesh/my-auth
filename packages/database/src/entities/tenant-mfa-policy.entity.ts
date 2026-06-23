import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

// schema: 'public' forces TypeORM to qualify with public. regardless of search_path
// (TenantSchemaMiddleware sets search_path = fk_{slug} on auth routes)
@Entity({ name: 'tenant_mfa_policy', schema: 'public' })
@Index(['tenantId'], { unique: true })
export class TenantMfaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ default: false, name: 'enforce_for_all_users' })
  enforceForAllUsers!: boolean;

  @Column({ default: false, name: 'enforce_for_admins' })
  enforceForAdmins!: boolean;

  @Column({ type: 'int', default: 0, name: 'grace_period_days' })
  gracePeriodDays!: number;

  @Column({ type: 'simple-array', default: '', name: 'exempt_role_slugs' })
  exemptRoleSlugs!: string[];

  @UpdateDateColumn({name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}

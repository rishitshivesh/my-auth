import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

// Per-tenant table (moved into the template/fk_* schemas by MoveToTemplateSchema1935...).
// It must NOT be pinned to `public`: there is no such table, the lookup failed with 42P01 and
// the policy silently fell back to "not enforced".
@Entity({ name: 'tenant_mfa_policy' })
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

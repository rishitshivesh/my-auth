import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

// schema: 'public' forces TypeORM to qualify with public. regardless of search_path
// (TenantSchemaMiddleware sets search_path = fk_{slug} on auth routes)
@Entity({ name: 'tenant_mfa_policy', schema: 'public' })
@Index(['tenantId'], { unique: true })
export class TenantMfaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ default: false })
  enforceForAllUsers!: boolean;

  @Column({ default: false })
  enforceForAdmins!: boolean;

  @Column({ type: 'int', default: 0 })
  gracePeriodDays!: number;

  @Column({ type: 'simple-array', default: '' })
  exemptRoleSlugs!: string[];

  @UpdateDateColumn()
  updatedAt!: Date;
}

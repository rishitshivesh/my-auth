import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

@Entity('tenant_mfa_policy')
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

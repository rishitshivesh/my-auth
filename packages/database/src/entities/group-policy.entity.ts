import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Group } from './group.entity';
import { Policy } from './policy.entity';

@Entity('group_policies')
@Unique(['groupId', 'policyId'])
@Index(['groupId'])
@Index(['policyId'])
@Index(['tenantId'])
export class GroupPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'group_id' })
  groupId!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column({ type: 'uuid', name: 'policy_id' })
  policyId!: string;

  @ManyToOne(() => Policy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'policy_id' })
  policy!: Policy;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}

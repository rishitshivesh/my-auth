import {
  Entity,
  Column,
  Index,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('groups')
@Index(['tenantId'])
@Index(['tenantId', 'name'], { unique: true })
@Index(['parentGroupId'])
@Index(['path'])
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'parent_group_id' })
  parentGroupId!: string | null;

  @Column({ type: 'varchar', length: 1000, default: '/' })
  path!: string;

  @Column({ type: 'boolean', default: false, name: 'is_system' })
  isSystem!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}

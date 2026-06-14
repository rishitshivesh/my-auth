import {
  Entity,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('policies')
@Index(['tenantId'])
@Index(['tenantId', 'name'], { unique: true })
@Index(['type'])
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb' })
  document!: {
    Version: string;
    Statement: Array<{
      Sid?: string;
      Effect: 'Allow' | 'Deny';
      Principal?: string | string[] | '*';
      Action: string | string[];
      Resource: string | string[];
      Condition?: {
        IpAddress?: { 'sentry:SourceIp': string | string[] };
        DateGreaterThan?: { 'sentry:CurrentTime': string };
        DateLessThan?: { 'sentry:CurrentTime': string };
        Bool?: { 'sentry:MultiFactorAuthPresent': boolean };
        StringEquals?: Record<string, string | string[]>;
      };
    }>;
  };

  @Column({ type: 'boolean', default: false, name: 'is_system' })
  isSystem!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'inline' })
  type!: 'inline' | 'managed';

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}

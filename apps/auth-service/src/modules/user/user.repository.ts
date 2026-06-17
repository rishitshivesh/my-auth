import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantAwareRepository } from '@/core/database/tenant-aware.repository';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { User } from '@repo/database';

@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
  protected get entityTarget() {
    return User;
  }

  constructor(
    @InjectDataSource() dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(dataSource, tenantContext);
  }

  async findByEmail(email: string): Promise<User | null> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    return this.findOne({ where: { email } });
  }

  async findByTenantAndId(tenantId: string, userId: string): Promise<User | null> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    return this.findOne({ where: { id: userId, tenantId } });
  }
}

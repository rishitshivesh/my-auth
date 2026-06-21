import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, EntityTarget } from 'typeorm';
import { Session } from '@repo/database';
import { TenantAwareRepository } from './tenant-aware.repository';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class SessionRepository extends TenantAwareRepository<Session> {
  protected get entityTarget(): EntityTarget<Session> {
    return Session;
  }

  constructor(
    @InjectDataSource() dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(dataSource, tenantContext);
  }

  executeRaw<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.manager.query(sql, params);
  }

  transaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.manager.transaction(fn);
  }
}

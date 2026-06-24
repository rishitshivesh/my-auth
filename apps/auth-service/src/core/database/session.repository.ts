import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, EntityTarget, IsNull } from 'typeorm';
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

  /** Find all non-revoked sessions for a user, newest first. */
  findActiveByUserId(userId: string, tenantId: string): Promise<Session[]> {
    // Defense-in-depth: tenantId filter retained alongside schema-level isolation
    return this.find({
      where: { userId, tenantId, revokedAt: IsNull() },
      order: { lastActivity: 'DESC' },
    });
  }

  /** Find a single session by ID within a tenant. */
  findBySessionId(sessionId: string, tenantId: string): Promise<Session | null> {
    // Defense-in-depth: tenantId filter retained alongside schema-level isolation
    return this.findOne({ where: { id: sessionId, tenantId } });
  }

  executeRaw<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.manager.query(sql, params);
  }

  transaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.manager.transaction(fn);
  }
}

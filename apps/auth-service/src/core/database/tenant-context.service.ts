import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { QueryRunner, EntityManager } from 'typeorm';

interface TenantContext {
  queryRunner: QueryRunner;
  schemaName: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getContext(): TenantContext | null {
    return this.storage.getStore() ?? null;
  }

  getQueryRunner(): QueryRunner | null {
    return this.getContext()?.queryRunner ?? null;
  }

  getSchemaName(): string | null {
    return this.getContext()?.schemaName ?? null;
  }

  hasTenantContext(): boolean {
    return this.getContext() !== null;
  }

  /**
   * Run a callback inside a database transaction on the tenant-scoped connection.
   * Automatically commits on success, rolls back on error.
   *
   * Usage:
   *   await this.tenantContext.transaction(async (manager) => {
   *     await manager.save(User, user);
   *     await manager.save(AuditLog, log);
   *   });
   */
  async transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    const qr = this.getQueryRunner();
    if (!qr) {
      throw new Error('No tenant context — cannot run tenant transaction outside request scope');
    }
    await qr.startTransaction();
    try {
      const result = await callback(qr.manager);
      await qr.commitTransaction();
      return result;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    }
  }
}

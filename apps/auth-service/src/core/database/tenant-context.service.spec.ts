import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from './tenant-context.service';
import { QueryRunner, EntityManager } from 'typeorm';

function makeMockQueryRunner(overrides: Partial<QueryRunner> = {}): jest.Mocked<QueryRunner> {
  return {
    manager: {} as EntityManager,
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<QueryRunner>;
}

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantContextService],
    }).compile();

    service = module.get<TenantContextService>(TenantContextService);
  });

  it('stores and retrieves tenant context via AsyncLocalStorage', async () => {
    const qr = makeMockQueryRunner();
    const context = { queryRunner: qr, schemaName: 'fk_acme' };

    await new Promise<void>((resolve) => {
      service.run(context, () => {
        expect(service.getContext()).toEqual(context);
        expect(service.getQueryRunner()).toBe(qr);
        expect(service.getSchemaName()).toBe('fk_acme');
        resolve();
      });
    });

    // Outside run(), context is null
    expect(service.getContext()).toBeNull();
    expect(service.getQueryRunner()).toBeNull();
    expect(service.getSchemaName()).toBeNull();
  });

  it('nested contexts are independent', async () => {
    const qrA = makeMockQueryRunner();
    const qrB = makeMockQueryRunner();
    const ctxA = { queryRunner: qrA, schemaName: 'fk_tenant_a' };
    const ctxB = { queryRunner: qrB, schemaName: 'fk_tenant_b' };

    await new Promise<void>((resolve) => {
      service.run(ctxA, () => {
        expect(service.getSchemaName()).toBe('fk_tenant_a');

        service.run(ctxB, () => {
          expect(service.getSchemaName()).toBe('fk_tenant_b');
        });

        // After inner run exits, outer context is restored
        expect(service.getSchemaName()).toBe('fk_tenant_a');
        resolve();
      });
    });
  });

  it('hasTenantContext() returns false outside run()', () => {
    expect(service.hasTenantContext()).toBe(false);
  });

  it('transaction() commits on success', async () => {
    const mockManager = { save: jest.fn() } as unknown as EntityManager;
    const qr = makeMockQueryRunner();
    Object.defineProperty(qr, 'manager', { value: mockManager, writable: false });

    const ctx = { queryRunner: qr, schemaName: 'fk_acme' };
    const callbackResult = { id: '123' };

    await new Promise<void>((resolve, reject) => {
      service.run(ctx, async () => {
        const result = await service.transaction(async (manager) => {
          expect(manager).toBe(mockManager);
          return callbackResult;
        });

        expect(result).toEqual(callbackResult);
        expect(qr.startTransaction).toHaveBeenCalledTimes(1);
        expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
        expect(qr.rollbackTransaction).not.toHaveBeenCalled();
        resolve();
      });
    });
  });

  it('transaction() rolls back on error', async () => {
    const qr = makeMockQueryRunner();
    const ctx = { queryRunner: qr, schemaName: 'fk_acme' };
    const error = new Error('DB failure');

    await new Promise<void>((resolve, reject) => {
      service.run(ctx, async () => {
        await expect(
          service.transaction(async () => {
            throw error;
          }),
        ).rejects.toThrow('DB failure');

        expect(qr.startTransaction).toHaveBeenCalledTimes(1);
        expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
        expect(qr.commitTransaction).not.toHaveBeenCalled();
        resolve();
      });
    });
  });
});

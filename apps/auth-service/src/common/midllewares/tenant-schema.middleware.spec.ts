import { Test, TestingModule } from '@nestjs/testing';
import { TenantSchemaMiddleware } from './tenant-schema.middleware';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { TenantSchemaService } from '@/core/tenant/tenant-schema.service';
import { DataSource, QueryRunner } from 'typeorm';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';

function makeResponse(): jest.Mocked<Response> & EventEmitter {
  const emitter = new EventEmitter();
  return {
    ...emitter,
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emit: emitter.emit.bind(emitter),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response> & EventEmitter;
}

function makeQueryRunner(overrides: Partial<QueryRunner> = {}): jest.Mocked<QueryRunner> {
  return {
    query: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<QueryRunner>;
}

describe('TenantSchemaMiddleware', () => {
  let middleware: TenantSchemaMiddleware;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockTenantContext: jest.Mocked<TenantContextService>;
  let mockTenantSchemaService: jest.Mocked<TenantSchemaService>;

  beforeEach(async () => {
    mockDataSource = {
      createQueryRunner: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    mockTenantContext = {
      run: jest.fn((ctx, cb) => cb()),
    } as unknown as jest.Mocked<TenantContextService>;

    mockTenantSchemaService = {
      getSchemaName: jest.fn((slug: string) => `fk_${slug}`),
      schemaExists: jest.fn().mockResolvedValue(true),
      createSchema: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TenantSchemaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSchemaMiddleware,
        { provide: DataSource, useValue: mockDataSource },
        { provide: TenantContextService, useValue: mockTenantContext },
        { provide: TenantSchemaService, useValue: mockTenantSchemaService },
      ],
    }).compile();

    middleware = module.get<TenantSchemaMiddleware>(TenantSchemaMiddleware);
  });

  it('routes schema path for known tenant', async () => {
    const qr = makeQueryRunner();
    mockDataSource.createQueryRunner.mockReturnValue(qr);

    const req = { tenant: { slug: 'acme', id: 'tenant-uuid' } } as unknown as Request;
    const res = makeResponse();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(qr.query).toHaveBeenCalledWith(`SET search_path TO "fk_acme", public`);
    expect(mockTenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'fk_acme' }),
      expect.any(Function),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through for platform routes (no tenant)', async () => {
    const req = { tenant: undefined } as unknown as Request;
    const res = makeResponse();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('auto-heals missing schema', async () => {
    mockTenantSchemaService.schemaExists.mockResolvedValue(false);
    const qr = makeQueryRunner();
    mockDataSource.createQueryRunner.mockReturnValue(qr);

    const req = { tenant: { slug: 'newco', id: 'tenant-uuid' } } as unknown as Request;
    const res = makeResponse();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(mockTenantSchemaService.createSchema).toHaveBeenCalledWith('newco');
    expect(qr.query).toHaveBeenCalledWith(`SET search_path TO "fk_newco", public`);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('releases queryRunner on response finish', async () => {
    const qr = makeQueryRunner();
    mockDataSource.createQueryRunner.mockReturnValue(qr);

    const req = { tenant: { slug: 'acme', id: 'tenant-uuid' } } as unknown as Request;
    const res = makeResponse();
    const next = jest.fn();

    await middleware.use(req, res, next);

    // Simulate response finish
    res.emit('finish');
    await new Promise((r) => setImmediate(r));

    expect(qr.query).toHaveBeenCalledWith('SET search_path TO public');
    expect(qr.release).toHaveBeenCalledTimes(1);
  });

  it('returns 503 on queryRunner query failure', async () => {
    const error = new Error('Connection refused');
    const qr = makeQueryRunner({
      query: jest.fn().mockRejectedValue(error),
    });
    mockDataSource.createQueryRunner.mockReturnValue(qr);

    const req = { tenant: { slug: 'acme', id: 'tenant-uuid' } } as unknown as Request;
    const res = makeResponse();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'Tenant schema unavailable',
    });
    expect(qr.release).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});

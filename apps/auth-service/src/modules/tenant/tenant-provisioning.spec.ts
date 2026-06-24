import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { TenantSchemaService } from '@/core/tenant/tenant-schema.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from '@repo/database';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InternalServerErrorException } from '@nestjs/common';

const mockTenantRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  findOne: jest.fn(),
});

const mockSchemaService = () => ({
  createSchema: jest.fn(),
  getSchemaName: jest.fn().mockReturnValue('fk_test'),
  isVerifiedAndReady: jest.fn().mockResolvedValue(true),
  markVerified: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  del: jest.fn(),
});

describe('TenantService.create (M-006)', () => {
  let service: TenantService;
  let tenantRepo: ReturnType<typeof mockTenantRepo>;
  let schemaService: ReturnType<typeof mockSchemaService>;

  beforeEach(async () => {
    tenantRepo = mockTenantRepo();
    schemaService = mockSchemaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: TenantSchemaService, useValue: schemaService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager() },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  it('T-001: rolls back tenant row when schema creation fails', async () => {
    const savedTenant = { id: 'tenant-1', slug: 'acme', active: true } as Tenant;
    tenantRepo.create.mockReturnValue(savedTenant);
    tenantRepo.save.mockResolvedValue(savedTenant);
    tenantRepo.delete.mockResolvedValue(undefined);
    schemaService.createSchema.mockRejectedValue(new Error('disk full'));

    await expect(
      service.create({ slug: 'acme', name: 'Acme Corp' }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(tenantRepo.delete).toHaveBeenCalledWith('tenant-1');
  });

  it('T-001b: response is safe error message, not internal error detail', async () => {
    const savedTenant = { id: 'tenant-1', slug: 'acme', active: true } as Tenant;
    tenantRepo.create.mockReturnValue(savedTenant);
    tenantRepo.save.mockResolvedValue(savedTenant);
    tenantRepo.delete.mockResolvedValue(undefined);
    schemaService.createSchema.mockRejectedValue(new Error('disk full'));

    try {
      await service.create({ slug: 'acme', name: 'Acme Corp' });
    } catch (err) {
      expect(err).toBeInstanceOf(InternalServerErrorException);
      const body = (err as InternalServerErrorException).getResponse() as { message: string };
      expect(body.message).toBe('Workspace provisioning failed. Please try again.');
      expect(body.message).not.toContain('disk full');
    }
  });

  it('T-001c: successful schema creation does not delete tenant', async () => {
    const savedTenant = { id: 'tenant-2', slug: 'beta', active: true } as Tenant;
    tenantRepo.create.mockReturnValue(savedTenant);
    tenantRepo.save.mockResolvedValue(savedTenant);
    schemaService.createSchema.mockResolvedValue(undefined);

    const result = await service.create({ slug: 'beta', name: 'Beta Corp' });

    expect(result).toBe(savedTenant);
    expect(tenantRepo.delete).not.toHaveBeenCalled();
  });
});

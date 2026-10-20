import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { TenantSchemaService } from '@/core/tenant/tenant-schema.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from '@repo/database';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ApiException } from '../../common/http';

const mockTenantRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  findOne: jest.fn(),
});

const mockSchemaService = () => ({
  createSchema: jest.fn(),
  getSchemaName: jest.fn().mockReturnValue('fk_test'),
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

  // T-001: schema creation failure must rollback tenant row
  it('T-001: rolls back tenant row when schema creation fails', async () => {
    const savedTenant = { id: 'tenant-1', slug: 'acme', active: true } as Tenant;
    tenantRepo.create.mockReturnValue(savedTenant);
    tenantRepo.save.mockResolvedValue(savedTenant);
    tenantRepo.delete.mockResolvedValue(undefined);
    schemaService.createSchema.mockRejectedValue(new Error('disk full'));

    await expect(
      service.create({ slug: 'acme', name: 'Acme Corp' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    // Tenant row must be deleted
    expect(tenantRepo.delete).toHaveBeenCalledWith('tenant-1');
  });

  it('T-001b: response is safe error message, not internal error detail', async () => {
    expect.assertions(3);
    const savedTenant = { id: 'tenant-1', slug: 'acme', active: true } as Tenant;
    tenantRepo.create.mockReturnValue(savedTenant);
    tenantRepo.save.mockResolvedValue(savedTenant);
    tenantRepo.delete.mockResolvedValue(undefined);
    schemaService.createSchema.mockRejectedValue(new Error('disk full'));

    try {
      await service.create({ slug: 'acme', name: 'Acme Corp' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const detail = (err as ApiException).detail as string;
      expect(detail).toBe('Workspace provisioning failed. Please try again.');
      expect(detail).not.toContain('disk full');
    }
  });
});

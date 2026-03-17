import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBrandingService } from './tenant-branding.service';
import { FileStorageService } from './file-storage.service';
import { TenantBranding } from '@repo/database';

// ── Helpers ────────────────────────────────────────────────────
function makeBrandingRow(overrides: Partial<TenantBranding> = {}): TenantBranding {
  return Object.assign(new TenantBranding(), {
    id: 'row-uuid',
    tenantId: 'tenant-uuid',
    primaryColor: '#6366f1',
    fontFamily: 'Inter',
    headerWeight: 'bold' as const,
    backgroundStyle: 'solid' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('TenantBrandingService', () => {
  let service: TenantBrandingService;
  let repo: jest.Mocked<Repository<TenantBranding>>;
  let fileStorage: jest.Mocked<FileStorageService>;

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<Repository<TenantBranding>>> = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockFileStorage: Partial<jest.Mocked<FileStorageService>> = {
      store: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantBrandingService,
        { provide: getRepositoryToken(TenantBranding), useValue: mockRepo },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();

    service = module.get(TenantBrandingService);
    repo = module.get(getRepositoryToken(TenantBranding));
    fileStorage = module.get(FileStorageService);
  });

  // ── getBranding ──────────────────────────────────────────────

  describe('getBranding', () => {
    it('returns defaults when no row exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.getBranding('tenant-uuid');
      expect(result.primaryColor).toBe('#6366f1');
      expect(result.fontFamily).toBe('Inter');
      expect(result.headerWeight).toBe('bold');
      expect(result.backgroundStyle).toBe('solid');
      expect(result.logoUrl).toBeUndefined();
    });

    it('returns stored row values', async () => {
      repo.findOne.mockResolvedValue(
        makeBrandingRow({ primaryColor: '#ff0000', logoUrl: 'https://cdn.example.com/logo.png' }),
      );
      const result = await service.getBranding('tenant-uuid');
      expect(result.primaryColor).toBe('#ff0000');
      expect(result.logoUrl).toBe('https://cdn.example.com/logo.png');
    });
  });

  // ── upsertBranding (save round-trip) ────────────────────────

  describe('upsertBranding', () => {
    it('creates a new row when none exists and returns the saved values', async () => {
      repo.findOne.mockResolvedValue(null);
      const newRow = makeBrandingRow({ primaryColor: '#123456' });
      repo.create.mockReturnValue(newRow);
      repo.save.mockResolvedValue(newRow);

      const result = await service.upsertBranding('tenant-uuid', {
        primaryColor: '#123456',
        fontFamily: 'Poppins',
        headerWeight: 'regular',
        backgroundStyle: 'gradient',
      });

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result.primaryColor).toBe('#123456');
    });

    it('merges updates into an existing row', async () => {
      const existing = makeBrandingRow({ primaryColor: '#aabbcc' });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (row) => row as TenantBranding);

      const result = await service.upsertBranding('tenant-uuid', {
        primaryColor: '#112233',
      });

      expect(result.primaryColor).toBe('#112233');
      // Other fields unchanged
      expect(result.fontFamily).toBe('Inter');
    });

    it('only saves fields that are explicitly provided', async () => {
      const existing = makeBrandingRow({
        primaryColor: '#aabbcc',
        fontFamily: 'Roboto',
      });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (row) => row as TenantBranding);

      const result = await service.upsertBranding('tenant-uuid', {
        headerWeight: 'regular',
      });

      expect(result.fontFamily).toBe('Roboto');   // unchanged
      expect(result.headerWeight).toBe('regular'); // updated
    });
  });

  // ── storeLogo ────────────────────────────────────────────────

  describe('storeLogo', () => {
    it('stores file and returns public URL', async () => {
      const publicUrl = 'http://localhost:4000/uploads/logo-tenant-uuid-abc.png';
      fileStorage.store.mockResolvedValue(publicUrl);
      const existing = makeBrandingRow();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (row) => row as TenantBranding);

      const url = await service.storeLogo(
        'tenant-uuid',
        Buffer.from('fake-png'),
        'image/png',
      );

      expect(url).toBe(publicUrl);
      expect(fileStorage.store).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/png',
        'logo-tenant-uuid',
      );
    });

    it('creates branding row if it does not exist before storing logo', async () => {
      fileStorage.store.mockResolvedValue('http://localhost:4000/uploads/logo.png');
      repo.findOne.mockResolvedValue(null);
      const newRow = makeBrandingRow();
      repo.create.mockReturnValue(newRow);
      repo.save.mockImplementation(async (row) => row as TenantBranding);

      await service.storeLogo('tenant-uuid', Buffer.from('data'), 'image/jpeg');

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });
});

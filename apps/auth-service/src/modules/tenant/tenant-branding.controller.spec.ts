import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { TenantBrandingController } from './tenant-branding.controller';
import { TenantBrandingService } from './tenant-branding.service';
import { SecurityEventService } from '@/common/service/security-event.service';
import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { TenantBrandingDto } from './dto/tenant-branding.dto';
import { JwtAuthGuard } from '@/common/guards';
import { TenantBindingGuard } from '@/common/guards/tenant-binding.guard';
import { SessionGuard } from '@/common/guards/session.guard';
import { PermissionsGuard } from '@/modules/rbac/guards/permissions.guard';

const PASS_GUARD = { canActivate: () => true };

// ── DTO validation ─────────────────────────────────────────────

describe('TenantBrandingDto validation', () => {
  it('accepts a valid 6-digit hex color', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { primaryColor: '#0066FF' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a 3-digit hex color', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { primaryColor: '#FFF' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'primaryColor')).toBe(true);
  });

  it('rejects a hex with invalid characters', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { primaryColor: '#GGGGGG' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'primaryColor')).toBe(true);
  });

  it('rejects a hex missing the leading #', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { primaryColor: '0066FF' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'primaryColor')).toBe(true);
  });

  it('accepts an allowlisted fontFamily', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { fontFamily: 'Poppins' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a fontFamily not in the allowlist', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { fontFamily: 'Comic Sans MS' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'fontFamily')).toBe(true);
  });

  it('rejects an invalid headerWeight', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { headerWeight: 'extra-bold' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'headerWeight')).toBe(true);
  });

  it('rejects an invalid backgroundStyle', async () => {
    const dto = Object.assign(new TenantBrandingDto(), { backgroundStyle: 'blurry' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'backgroundStyle')).toBe(true);
  });

  it('accepts valid backgroundStyle values', async () => {
    for (const style of ['solid', 'gradient']) {
      const dto = Object.assign(new TenantBrandingDto(), { backgroundStyle: style });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('passes with all fields omitted (all optional)', async () => {
    const dto = new TenantBrandingDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

// ── Logo upload – size + MIME guards ──────────────────────────

describe('TenantBrandingController – logo upload guards', () => {
  let controller: TenantBrandingController;

  const mockBrandingService = {
    getBranding: jest.fn(),
    upsertBranding: jest.fn(),
    storeLogo: jest.fn().mockResolvedValue('http://localhost:4000/uploads/logo.png'),
  };

  const mockSecurityEvents = {
    log: jest.fn(),
  };

  const mockReq = {
    tenantId: 'tenant-uuid',
    user: { sub: 'user-uuid', email: 'admin@example.com' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantBrandingController],
      providers: [
        { provide: TenantBrandingService, useValue: mockBrandingService },
        { provide: SecurityEventService, useValue: mockSecurityEvents },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue(PASS_GUARD)
      .overrideGuard(TenantBindingGuard).useValue(PASS_GUARD)
      .overrideGuard(SessionGuard).useValue(PASS_GUARD)
      .overrideGuard(PermissionsGuard).useValue(PASS_GUARD)
      .compile();

    controller = module.get(TenantBrandingController);
  });

  it('accepts a valid PNG under 500 KB', async () => {
    const file = {
      buffer: Buffer.alloc(100 * 1024), // 100 KB
      mimetype: 'image/png',
      size: 100 * 1024,
    } as Express.Multer.File;

    const result = await controller.uploadLogo(mockReq as any, file);
    expect(result.logoUrl).toBe('http://localhost:4000/uploads/logo.png');
  });

  it('throws PayloadTooLargeException for files > 500 KB', async () => {
    const file = {
      buffer: Buffer.alloc(501 * 1024),
      mimetype: 'image/png',
      size: 501 * 1024,
    } as Express.Multer.File;

    await expect(controller.uploadLogo(mockReq as any, file)).rejects.toThrow(
      PayloadTooLargeException,
    );
  });

  it('throws BadRequestException when no file is provided', async () => {
    await expect(controller.uploadLogo(mockReq as any, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns correct logoUrl on success', async () => {
    mockBrandingService.storeLogo.mockResolvedValueOnce(
      'https://cdn.example.com/logo-abc.png',
    );
    const file = {
      buffer: Buffer.alloc(1024),
      mimetype: 'image/jpeg',
      size: 1024,
    } as Express.Multer.File;

    const { logoUrl } = await controller.uploadLogo(mockReq as any, file);
    expect(logoUrl).toBe('https://cdn.example.com/logo-abc.png');
  });
});

// ── Branding save round-trip ───────────────────────────────────

describe('TenantBrandingController – save round-trip', () => {
  let controller: TenantBrandingController;

  const savedBranding = {
    primaryColor: '#123456',
    fontFamily: 'Poppins',
    headerWeight: 'regular' as const,
    backgroundStyle: 'gradient' as const,
  };

  const mockBrandingService = {
    upsertBranding: jest.fn().mockResolvedValue(savedBranding),
    getBranding: jest.fn().mockResolvedValue(savedBranding),
    storeLogo: jest.fn(),
  };

  const mockSecurityEvents = { log: jest.fn() };
  const mockReq = {
    tenantId: 'tenant-uuid',
    user: { sub: 'user-uuid', email: 'admin@example.com' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantBrandingController],
      providers: [
        { provide: TenantBrandingService, useValue: mockBrandingService },
        { provide: SecurityEventService, useValue: mockSecurityEvents },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue(PASS_GUARD)
      .overrideGuard(TenantBindingGuard).useValue(PASS_GUARD)
      .overrideGuard(SessionGuard).useValue(PASS_GUARD)
      .overrideGuard(PermissionsGuard).useValue(PASS_GUARD)
      .compile();

    controller = module.get(TenantBrandingController);
  });

  it('GET returns current branding', async () => {
    const result = await controller.getBranding(mockReq as any);
    expect(result.primaryColor).toBe('#123456');
    expect(result.fontFamily).toBe('Poppins');
  });

  it('PUT saves branding and returns updated config', async () => {
    const dto = { primaryColor: '#123456', fontFamily: 'Poppins' };
    const result = await controller.updateBranding(mockReq as any, dto as any);
    expect(mockBrandingService.upsertBranding).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result.primaryColor).toBe('#123456');
  });

  it('PUT writes a branding.updated audit event', async () => {
    const dto = { primaryColor: '#abcdef' };
    await controller.updateBranding(mockReq as any, dto as any);
    expect(mockSecurityEvents.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'branding.updated' }),
    );
  });
});

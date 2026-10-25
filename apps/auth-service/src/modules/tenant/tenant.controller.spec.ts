import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTenantDto, SetCustomDomainDto, TenantController } from './tenant.controller';

jest.mock('@/common/guards', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('@/common/guards/tenant-binding.guard', () => ({ TenantBindingGuard: class TenantBindingGuard {} }));
jest.mock('@/common/guards/session.guard', () => ({ SessionGuard: class SessionGuard {} }));
jest.mock('./tenant.service', () => ({ TenantService: class TenantService {} }));

const svc = { create: jest.fn().mockResolvedValue('created'), setCustomDomain: jest.fn().mockResolvedValue('dom'), verifyCustomDomain: jest.fn().mockResolvedValue('ver') };
const c = new TenantController(svc as never);
const admin = { user: { sub: 'u', isSuperAdmin: true } } as never;
const tenantAdmin = { user: { sub: 'u' } } as never;
const anon = {} as never;

describe('TenantController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCurrent returns req.tenant', async () => {
    expect(await c.getCurrent({ tenant: { id: 't' } } as never)).toEqual({ id: 't' });
  });

  it.each([
    ['create', (r: never) => c.create(r, { slug: 'abc', name: 'n' } as never), svc.create],
    ['setCustomDomain', (r: never) => c.setCustomDomain(r, 'i', { domain: 'a.io' }), svc.setCustomDomain],
    ['verifyDomain', (r: never) => c.verifyDomain(r, 'i'), svc.verifyCustomDomain],
  ])('%s is platform-admin only', async (_n, call, fn) => {
    await expect(call(tenantAdmin)).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
    await expect(call(anon)).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
    expect(fn).not.toHaveBeenCalled();
    await call(admin);
    expect(fn).toHaveBeenCalled();
  });

  it('passes args through', async () => {
    await c.setCustomDomain(admin, 'i', { domain: 'a.io' });
    expect(svc.setCustomDomain).toHaveBeenCalledWith('i', 'a.io');
    await c.verifyDomain(admin, 'i');
    expect(svc.verifyCustomDomain).toHaveBeenCalledWith('i');
  });

  describe('DTO validation', () => {
    const errs = async (cls: new () => object, o: object) => (await validate(plainToInstance(cls, o))).map((e) => e.property);
    it('CreateTenantDto', async () => {
      expect(await errs(CreateTenantDto, { slug: 'abc', name: 'n' })).toEqual([]);
      expect(await errs(CreateTenantDto, { slug: 'AB', name: 'n' })).toContain('slug');
      expect(await errs(CreateTenantDto, { slug: 'abc', name: 'x'.repeat(256) })).toContain('name');
      expect(await errs(CreateTenantDto, { slug: 'abc', name: 'n', allowedOrigins: [1] })).toContain('allowedOrigins');
    });
    it('SetCustomDomainDto rejects bad hostnames', async () => {
      expect(await errs(SetCustomDomainDto, { domain: 'login.acme.io' })).toEqual([]);
      for (const d of ['localhost', 'a..io', '-a.io', 'a.io/path', 'http://a.io', 'a b.io', '1.2.3.4', 'a.i']) {
        expect(await errs(SetCustomDomainDto, { domain: d })).toContain('domain');
      }
    });
  });
});

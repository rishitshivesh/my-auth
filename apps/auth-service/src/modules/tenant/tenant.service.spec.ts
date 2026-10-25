import { TenantService } from './tenant.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/core/tenant/tenant-schema.service', () => ({ TenantSchemaService: class TenantSchemaService {} }));

function build() {
  const repo = { findOne: jest.fn(), create: jest.fn((x: unknown) => ({ id: 'new', ...(x as object) })), save: jest.fn(async (x: unknown) => x), delete: jest.fn().mockResolvedValue(undefined), update: jest.fn() };
  const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
  const schema = { createSchema: jest.fn().mockResolvedValue(undefined) };
  return { svc: new TenantService(repo as never, cache as never, schema as never), repo, cache, schema };
}

describe('TenantService', () => {
  const OLD = process.env['SENTRY_PLATFORM_DOMAIN'];
  afterEach(() => {
    if (OLD === undefined) delete process.env['SENTRY_PLATFORM_DOMAIN'];
    else process.env['SENTRY_PLATFORM_DOMAIN'] = OLD;
  });

  describe.each([
    ['findBySlug', 'tenant:slug:acme', 'acme', { slug: 'acme', active: true }, 300000],
    ['findByCustomDomain', 'tenant:domain:a.io', 'a.io', { customDomain: 'a.io', customDomainVerified: true, active: true }, 300000],
    ['findById', 'tenant:id:i1', 'i1', { id: 'i1', active: true }, 600000],
  ] as const)('%s', (method, key, arg, where, ttl) => {
    it('returns cached value without DB', async () => {
      const b = build();
      b.cache.get.mockResolvedValue({ id: 'cached' });
      expect(await b.svc[method](arg)).toEqual({ id: 'cached' });
      expect(b.cache.get).toHaveBeenCalledWith(key);
      expect(b.repo.findOne).not.toHaveBeenCalled();
    });
    it('queries active tenants only and caches hits with ttl', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue({ id: 'x' });
      expect(await b.svc[method](arg)).toEqual({ id: 'x' });
      expect(b.repo.findOne).toHaveBeenCalledWith({ where });
      expect(b.cache.set).toHaveBeenCalledWith(key, { id: 'x' }, ttl);
    });
    it('does not cache misses', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue(null);
      expect(await b.svc[method](arg)).toBeNull();
      expect(b.cache.set).not.toHaveBeenCalled();
    });
  });

  it('findById maps DB errors to TENANT_NOT_FOUND', async () => {
    const b = build();
    b.repo.findOne.mockRejectedValue(new Error('invalid uuid'));
    await expect(b.svc.findById('bad')).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });

  describe('invalidateCache', () => {
    it('no-ops for unknown tenant', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue(null);
      await b.svc.invalidateCache('x');
      expect(b.cache.del).not.toHaveBeenCalled();
    });
    it('clears id, slug and domain keys', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue({ slug: 's', customDomain: 'd.io' });
      await b.svc.invalidateCache('i');
      expect(b.cache.del.mock.calls.map((c) => c[0])).toEqual(['tenant:id:i', 'tenant:slug:s', 'tenant:domain:d.io']);
    });
    it('skips domain key without custom domain', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue({ slug: 's' });
      await b.svc.invalidateCache('i');
      expect(b.cache.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it.each(['ab', '-abc', 'a_bc', 'a b', '', 'x'.repeat(64), 'ab.c'])('rejects invalid slug %p', async (slug) => {
      const b = build();
      await expect(b.svc.create({ slug, name: 'n' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(b.repo.save).not.toHaveBeenCalled();
    });
    it.each(['abc', 'a-b', '9ab', 'x'.repeat(63)])('accepts boundary slug %p and lowercases', async (slug) => {
      const b = build();
      const out = await b.svc.create({ slug: slug.toUpperCase(), name: 'n' });
      expect(out.slug).toBe(slug);
      expect(out.environment).toBe('production');
      expect(b.schema.createSchema).toHaveBeenCalledWith(slug);
    });
    it('respects environment', async () => {
      const b = build();
      expect(await b.svc.create({ slug: 'abc', name: 'n', environment: 'staging' })).toMatchObject({ environment: 'staging' });
    });
    it('rolls back tenant when schema creation fails, hiding internals', async () => {
      const b = build();
      b.schema.createSchema.mockRejectedValue(new Error('pg: secret detail'));
      const p = b.svc.create({ slug: 'abc', name: 'n' });
      await expect(p).rejects.toMatchObject({ code: 'INTERNAL_ERROR', detail: 'Workspace provisioning failed. Please try again.' });
      expect(b.repo.delete).toHaveBeenCalledWith('new');
    });
    it('still raises INTERNAL_ERROR when rollback delete also fails, and non-Error schema failures', async () => {
      const b = build();
      b.schema.createSchema.mockRejectedValue('str');
      b.repo.delete.mockRejectedValue(new Error('del'));
      await expect(b.svc.create({ slug: 'abc', name: 'n' })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('custom domains', () => {
    it('setCustomDomain: not found', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue(null);
      await expect(b.svc.setCustomDomain('i', 'a.io')).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });
    it('lowercases, resets verification and invalidates cache', async () => {
      const b = build();
      const t = { id: 'i', slug: 's', customDomainVerified: true };
      b.repo.findOne.mockResolvedValue(t);
      const out = await b.svc.setCustomDomain('i', 'Login.ACME.io');
      expect(out).toMatchObject({ customDomain: 'login.acme.io', customDomainVerified: false });
      expect(b.repo.save).toHaveBeenCalled();
      expect(b.cache.del).toHaveBeenCalled();
    });
    it.each(['sentry.scrolloop.com', 'evil.sentry.scrolloop.com', 'EVIL.Sentry.Scrolloop.com'])('blocks platform-domain %s', async (d) => {
      process.env['SENTRY_PLATFORM_DOMAIN'] = 'Sentry.Scrolloop.com';
      const b = build();
      b.repo.findOne.mockResolvedValue({ id: 'i' });
      await expect(b.svc.setCustomDomain('i', d)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(b.repo.save).not.toHaveBeenCalled();
    });
    it('allows lookalike suffix that is not a subdomain', async () => {
      process.env['SENTRY_PLATFORM_DOMAIN'] = 'sentry.scrolloop.com';
      const b = build();
      b.repo.findOne.mockResolvedValue({ id: 'i' });
      await expect(b.svc.setCustomDomain('i', 'notsentry.scrolloop.com')).resolves.toBeDefined();
    });
    it('verifyCustomDomain: not found / success', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.verifyCustomDomain('i')).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
      b.repo.findOne.mockResolvedValue({ id: 'i', slug: 's', customDomainVerified: false });
      expect(await b.svc.verifyCustomDomain('i')).toMatchObject({ customDomainVerified: true });
    });
  });

  describe('branding', () => {
    it('updateBranding merges and returns refreshed tenant', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValueOnce({ branding: { a: 1, b: 2 } }).mockResolvedValueOnce({ id: 'fresh' });
      expect(await b.svc.updateBranding('i', { b: 3 } as never)).toEqual({ id: 'fresh' });
      expect(b.repo.update).toHaveBeenCalledWith({ id: 'i' }, { branding: { a: 1, b: 3 } });
    });
    it('updateBranding with no existing branding', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue({});
      await b.svc.updateBranding('i', { b: 3 } as never);
      expect(b.repo.update).toHaveBeenCalledWith({ id: 'i' }, { branding: { b: 3 } });
    });

    // BUG: tenant.service.ts updateBranding throws a plain Error (HTTP 500) when the tenant is missing.
    it('updateBranding on missing tenant throws TENANT_NOT_FOUND', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue(null);
      await expect(b.svc.updateBranding('i', {})).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });

    it('getBrandingBySlug / ByDomain return branding or null', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValueOnce({ branding: { c: 1 } }).mockResolvedValueOnce(null).mockResolvedValueOnce({ branding: null }).mockResolvedValueOnce({ branding: { d: 1 } });
      expect(await b.svc.getBrandingBySlug('s')).toEqual({ c: 1 });
      expect(b.repo.findOne).toHaveBeenLastCalledWith({ where: { slug: 's' }, select: ['branding'] });
      expect(await b.svc.getBrandingBySlug('s')).toBeNull();
      expect(await b.svc.getBrandingByDomain('d.io')).toBeNull();
      expect(await b.svc.getBrandingByDomain('d.io')).toEqual({ d: 1 });
    });
    it('getTenantById', async () => {
      const b = build();
      b.repo.findOne.mockResolvedValue({ id: 'i' });
      expect(await b.svc.getTenantById('i')).toEqual({ id: 'i' });
    });
  });
});

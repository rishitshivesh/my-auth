import { CorsRefreshService, type CorsRequestContext } from './cors-refresh.service';
import type { DataSource } from 'typeorm';

jest.mock('@/common/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { logger } from '@/common/logger';

interface TenantFx { id: string; slug: string; allowed_origins: string | null; custom_domain?: string | null; clients?: string[] }

const A: TenantFx = { id: 'id-a', slug: 'acme', allowed_origins: 'https://app.acme.com' };
const B: TenantFx = { id: 'id-b', slug: 'beta', allowed_origins: 'https://app.beta.com, http://localhost:4000' };

function build(tenants: TenantFx[], failing: string[] = []): { svc: CorsRefreshService; query: jest.Mock } {
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('public.tenants')) {
      const rows = params?.[0] ? tenants.filter((t) => t.id === params[0]) : tenants;
      return rows.map((t) => ({ custom_domain: null, ...t }));
    }
    const schema = /"(fk_[a-z0-9_]+)"/.exec(sql)?.[1] ?? '';
    if (failing.includes(schema)) throw new Error('relation missing');
    const t = tenants.find((x) => `fk_${x.slug}` === schema);
    return (t?.clients ?? []).map((o) => ({ allowed_origins: o }));
  });
  return { svc: new CorsRefreshService({ query } as unknown as DataSource), query };
}

const ctx = (over: Partial<CorsRequestContext> & { slug?: string } = {}): CorsRequestContext => ({
  hostname: over.hostname ?? 'api.example.test',
  method: over.method ?? 'GET',
  headers: { ...(over.slug ? { 'x-tenant-slug': over.slug } : {}), ...(over.headers ?? {}) },
});

const PLATFORM = new Set(['https://portal.example.com']);

describe('CorsRefreshService per-tenant origins', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps each tenant origins separate and normalises them', async () => {
    const { svc } = build([A, B]);
    await svc.refresh();
    expect([...svc.getTenantOrigins('acme')]).toEqual(['https://app.acme.com']);
    expect([...svc.getTenantOrigins('beta')].sort()).toEqual(['http://localhost:4000', 'https://app.beta.com']);
    expect(svc.getTenantOrigins('nope').size).toBe(0);
  });

  it('includes OAuth client origins of that tenant only', async () => {
    const { svc } = build([{ ...A, clients: ['https://client.acme.com,https://c2.acme.com'] }, B]);
    await svc.refresh();
    expect(svc.getTenantOrigins('acme').has('https://client.acme.com')).toBe(true);
    expect(svc.getTenantOrigins('beta').has('https://client.acme.com')).toBe(false);
  });

  it('REGRESSION: a tenant origin is never accepted for another tenant', async () => {
    const { svc } = build([A, B]);
    await svc.refresh();
    // acme's origin on a request for beta, and vice versa
    expect(svc.isOriginAllowed('https://app.acme.com', ctx({ slug: 'beta' }), PLATFORM)).toBe(false);
    expect(svc.isOriginAllowed('https://app.beta.com', ctx({ slug: 'acme' }), PLATFORM)).toBe(false);
    // own origin works
    expect(svc.isOriginAllowed('https://app.acme.com', ctx({ slug: 'acme' }), PLATFORM)).toBe(true);
    // platform routes (no tenant) get only the fallback
    expect(svc.isOriginAllowed('https://app.acme.com', ctx(), PLATFORM)).toBe(false);
    // unknown tenant slug gets only the fallback
    expect(svc.isOriginAllowed('https://app.acme.com', ctx({ slug: 'ghost' }), PLATFORM)).toBe(false);
  });

  it('REGRESSION: host-resolved tenant wins over a spoofed x-tenant-slug header', async () => {
    process.env['SENTRY_PLATFORM_DOMAIN'] = 'sentry.example.com';
    try {
      const { svc } = build([A, B]);
      const svc2 = new CorsRefreshService((svc as unknown as { dataSource: DataSource }).dataSource);
      await svc2.refresh();
      const c = ctx({ hostname: 'beta.sentry.example.com', slug: 'acme' });
      expect(svc2.resolveTenantSlug(c)).toBe('beta');
      expect(svc2.isOriginAllowed('https://app.acme.com', c, PLATFORM)).toBe(false);
      expect(svc2.isOriginAllowed('https://app.beta.com', c, PLATFORM)).toBe(true);
    } finally {
      delete process.env['SENTRY_PLATFORM_DOMAIN'];
    }
  });

  it('always allows the platform fallback origins, for every tenant', async () => {
    const { svc } = build([A, B]);
    await svc.refresh();
    expect(svc.isOriginAllowed('https://portal.example.com', ctx({ slug: 'acme' }), PLATFORM)).toBe(true);
    expect(svc.isOriginAllowed('https://portal.example.com', ctx(), PLATFORM)).toBe(true);
  });

  it('resolves tenants by verified custom domain and by x-tenant-id', async () => {
    const { svc } = build([{ ...A, custom_domain: 'Auth.Acme.com' }, B]);
    await svc.refresh();
    expect(svc.resolveTenantSlug(ctx({ hostname: 'auth.acme.com' }))).toBe('acme');
    expect(svc.resolveTenantSlug(ctx({ headers: { 'x-tenant-id': 'id-b' } }))).toBe('beta');
  });

  it('answers a hostless preflight from the union, but the actual request stays strict', async () => {
    const { svc } = build([A, B]);
    await svc.refresh();
    const preflight = ctx({ method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } });
    expect(svc.isOriginAllowed('https://app.acme.com', preflight, PLATFORM)).toBe(true);
    expect(svc.isOriginAllowed('https://evil.example', preflight, PLATFORM)).toBe(false);
    expect(svc.isOriginAllowed('https://app.acme.com', ctx({ slug: 'beta' }), PLATFORM)).toBe(false);
    // a plain OPTIONS (not a CORS preflight) gets no union treatment
    expect(svc.isOriginAllowed('https://app.acme.com', ctx({ method: 'OPTIONS' }), PLATFORM)).toBe(false);
  });

  it('a preflight that does identify its tenant by host is strict', async () => {
    process.env['SENTRY_PLATFORM_DOMAIN'] = 'sentry.example.com';
    try {
      const { svc } = build([A, B]);
      await svc.refresh();
      const preflight = ctx({ hostname: 'beta.sentry.example.com', method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } });
      // PLATFORM_DOMAIN is read at construction, so build a fresh service for it
      const strict = new CorsRefreshService((svc as unknown as { dataSource: DataSource }).dataSource);
      await strict.refresh();
      expect(strict.isOriginAllowed('https://app.acme.com', preflight, PLATFORM)).toBe(false);
      expect(strict.isOriginAllowed('https://app.beta.com', preflight, PLATFORM)).toBe(true);
    } finally {
      delete process.env['SENTRY_PLATFORM_DOMAIN'];
    }
  });

  it('rejects wildcard, null, http non-localhost, paths, garbage and non-http schemes', async () => {
    const bad = ['*', 'null', 'http://evil.com', 'not a url', 'javascript:alert(1)', 'ftp://x.com', 'https://p.com/path', 'https://*.x.com'];
    const { svc } = build([{ ...A, allowed_origins: bad.join(',') + ',https://ok.com' }]);
    await svc.refresh();
    expect([...svc.getTenantOrigins('acme')]).toEqual(['https://ok.com']);
  });

  it('clears prior origins on refresh and skips a failing schema', async () => {
    const { svc } = build([A, B], ['fk_beta']);
    await svc.refresh();
    expect(svc.getTenantOrigins('beta').has('https://app.beta.com')).toBe(true);
    const empty = build([]);
    (svc as unknown as { dataSource: DataSource }).dataSource = { query: empty.query } as unknown as DataSource;
    await svc.refresh();
    expect(svc.getTenantOrigins('acme').size).toBe(0);
  });

  it('refreshTenant picks up an edit immediately and drops a deactivated tenant', async () => {
    const fixtures = [{ ...A }, { ...B }];
    const { svc } = build(fixtures);
    await svc.refresh();
    fixtures[0]!.allowed_origins = 'https://new.acme.com';
    await svc.refreshTenant('id-a');
    expect([...svc.getTenantOrigins('acme')]).toEqual(['https://new.acme.com']);
    expect(svc.getTenantOrigins('beta').has('https://app.beta.com')).toBe(true);
    fixtures.splice(0, 1);
    await svc.refreshTenant('id-a');
    expect(svc.getTenantOrigins('acme').size).toBe(0);
  });

  it('logs and swallows a top-level query failure', async () => {
    const svc = new CorsRefreshService({ query: jest.fn().mockRejectedValue(new Error('db down')) } as unknown as DataSource);
    await expect(svc.refresh()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('startAutoRefresh schedules refresh on the interval', async () => {
    jest.useFakeTimers();
    try {
      const query = jest.fn().mockResolvedValue([]);
      const svc = new CorsRefreshService({ query } as unknown as DataSource);
      svc.startAutoRefresh(1000);
      expect(query).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(query).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

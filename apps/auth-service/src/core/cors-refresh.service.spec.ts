import { CorsRefreshService } from './cors-refresh.service';
import type { DataSource } from 'typeorm';

jest.mock('@/common/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { logger } from '@/common/logger';

type Row = Record<string, string>;

const build = (query: jest.Mock): CorsRefreshService => {
  const ds = { query } as unknown as DataSource;
  return new CorsRefreshService(ds);
};

describe('CorsRefreshService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('collects valid origins from tenants and tenant-schema oauth clients', async () => {
    const query = jest.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('public.tenants')) return [{ allowed_origins: 'https://a.com, http://localhost:3000' }];
      if (sql.includes('information_schema')) return [{ schema_name: 'fk_acme' }];
      return [{ allowed_origins: 'https://b.com,http://127.0.0.1:8080' }];
    });
    const svc = build(query);
    await svc.refresh();
    expect([...svc.getOrigins()].sort()).toEqual(
      ['http://127.0.0.1:8080', 'http://localhost:3000', 'https://a.com', 'https://b.com'].sort(),
    );
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).toContain('"fk_acme"."oauth_clients"');
  });

  it('rejects wildcard, null, http non-localhost, garbage, and non-http schemes', async () => {
    const bad = ['*', 'null', 'http://evil.com', 'not a url', 'javascript:alert(1)', 'ftp://x.com'];
    const query = jest.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('public.tenants')) return [{ allowed_origins: bad.join(',') + ',https://ok.com' }];
      return [];
    });
    const svc = build(query);
    await svc.refresh();
    expect([...svc.getOrigins()]).toEqual(['https://ok.com']);
  });

  it('ignores empty entries silently and clears prior origins on refresh', async () => {
    let call = 0;
    const query = jest.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('public.tenants')) return call++ === 0 ? [{ allowed_origins: 'https://a.com,, ' }] : [];
      return [];
    });
    const svc = build(query);
    await svc.refresh();
    expect(svc.getOrigins().size).toBe(1);
    await svc.refresh();
    expect(svc.getOrigins().size).toBe(0);
  });

  it('skips invalid origins from client rows and continues when one schema fails', async () => {
    const query = jest.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('public.tenants')) return [];
      if (sql.includes('information_schema')) return [{ schema_name: 'fk_bad' }, { schema_name: 'fk_good' }];
      if (sql.includes('"fk_bad"')) throw new Error('relation missing');
      return [{ allowed_origins: 'http://evil.com, https://good.com' }];
    });
    const svc = build(query);
    await svc.refresh();
    expect([...svc.getOrigins()]).toEqual(['https://good.com']);
  });

  it('logs and swallows a top-level query failure', async () => {
    const svc = build(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(svc.refresh()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('startAutoRefresh schedules refresh on the interval', async () => {
    jest.useFakeTimers();
    try {
      const query = jest.fn().mockResolvedValue([]);
      const svc = build(query);
      svc.startAutoRefresh(1000);
      expect(query).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(query).toHaveBeenCalled();
      const before = query.mock.calls.length;
      await jest.advanceTimersByTimeAsync(1000);
      expect(query.mock.calls.length).toBeGreaterThan(before);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

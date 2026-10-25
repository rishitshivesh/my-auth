import * as crypto from 'crypto';
import { ApiException } from '@/common/http';
import { OAuthRefreshTokenService } from './oauth-refresh-token.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const DAY = 86_400_000;

type Row = Record<string, unknown>;

function setup(opts: { tenantSlug?: string | null } = {}) {
  const query = jest.fn();
  const findOne = jest.fn().mockResolvedValue(opts.tenantSlug === null ? null : { slug: opts.tenantSlug ?? 'Acme-Co' });
  const repo = { manager: { query, findOne } };
  const svc = new OAuthRefreshTokenService(repo as never);
  return { svc, query, findOne };
}

const stored = (over: Row = {}): Row => ({
  id: 'rt1',
  tenant_id: 't1',
  user_id: 'u1',
  session_id: 's1',
  client_id: 'c1',
  scope: 'openid',
  token_hash: 'h',
  family_id: 'fam',
  parent_token_id: null,
  used_at: null,
  revoked_at: null,
  revoked_reason: null,
  expires_at: new Date(NOW.getTime() + DAY),
  userEmail: 'a@b.c',
  ...over,
});

/** Route queries by SQL text. */
function route(query: jest.Mock, token: Row | undefined, session: Row | null = { id: 's1', revoked_at: null }) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('LEFT JOIN')) return token ? [token] : [];
    if (sql.includes('"sessions"')) return session ? [session] : [];
    if (sql.includes('SET used_at')) return [[], 1];
    return [];
  });
}

const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiException);
  return (e as ApiException).code;
};

describe('OAuthRefreshTokenService', () => {
  const prevSlug = process.env.SENTRY_PLATFORM_SLUG;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    delete process.env.SENTRY_PLATFORM_SLUG;
  });
  afterEach(() => {
    jest.useRealTimers();
    if (prevSlug === undefined) delete process.env.SENTRY_PLATFORM_SLUG;
    else process.env.SENTRY_PLATFORM_SLUG = prevSlug;
  });

  describe('schema resolution', () => {
    it('uses platform schema when tenantId empty (no lookup)', async () => {
      const { svc, query, findOne } = setup();
      query.mockResolvedValue([]);
      await svc.revokeToken('h', '');
      expect(findOne).not.toHaveBeenCalled();
      expect(query.mock.calls[0]?.[0]).toContain('"fk_sentry"');
    });
    it('honours SENTRY_PLATFORM_SLUG', async () => {
      process.env.SENTRY_PLATFORM_SLUG = 'plat';
      const { svc, query } = setup();
      query.mockResolvedValue([]);
      await svc.revokeToken('h', '');
      expect(query.mock.calls[0]?.[0]).toContain('"fk_plat"');
    });
    it('sanitizes tenant slug (no SQL identifier injection)', async () => {
      const { svc, query } = setup({ tenantSlug: 'Evil"; DROP--' });
      query.mockResolvedValue([]);
      await svc.revokeToken('h', 't1');
      expect(query.mock.calls[0]?.[0]).toContain('"fk_evil___drop__"');
    });
    it('falls back to platform schema when tenant not found', async () => {
      const { svc, query } = setup({ tenantSlug: null });
      query.mockResolvedValue([]);
      await svc.revokeToken('h', 't1');
      expect(query.mock.calls[0]?.[0]).toContain('"fk_sentry"');
    });
  });

  describe('createRefreshToken', () => {
    const params = { tenantId: 't1', userId: 'u1', sessionId: 's1' };
    it('stores only the hash, 30-day default expiry, nulls for optionals', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([
        { id: 'id1', tenant_id: 't1', user_id: 'u1', session_id: 's1', client_id: null, scope: null, token_hash: 'x', family_id: 'f', expires_at: '2026-01-31T00:00:00.000Z', created_at: NOW },
      ]);
      const { token, entity } = await svc.createRefreshToken(params);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const args = query.mock.calls[0]?.[1];
      expect(args[5]).toBe(sha(token));
      expect(args).not.toContain(token);
      expect(args[7]).toEqual(new Date(NOW.getTime() + 30 * DAY));
      expect(args[3]).toBeNull();
      expect(args[4]).toBeNull();
      expect(entity.id).toBe('id1');
      expect(entity.expiresAt).toEqual(new Date('2026-01-31T00:00:00.000Z'));
    });
    it('honours expiresInDays and passes through context', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([{ id: 'i' }]);
      await svc.createRefreshToken({ ...params, expiresInDays: 1, clientId: 'c', scope: 's', ipAddress: 'ip', userAgent: 'ua', deviceId: 'd' });
      const a = query.mock.calls[0]?.[1];
      expect(a[7]).toEqual(new Date(NOW.getTime() + DAY));
      expect(a.slice(3, 5)).toEqual(['c', 's']);
      expect(a.slice(8)).toEqual(['ip', 'ua', 'd']);
    });
    it('tokens are unique', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([{ id: 'i' }]);
      const a = await svc.createRefreshToken(params);
      const b = await svc.createRefreshToken(params);
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('rotateRefreshToken', () => {
    const p = { tenantId: 't1', token: 'plain', ipAddress: '1.1.1.1', userAgent: 'ua' };

    it('rotates: marks used, inserts child in same family, returns payload', async () => {
      const { svc, query } = setup();
      route(query, stored());
      const out = await svc.rotateRefreshToken(p);
      expect(query.mock.calls[0]?.[1]).toEqual(['t1', sha('plain')]);
      const upd = query.mock.calls.find((c) => String(c[0]).includes('SET used_at'))!;
      expect(upd[1]).toEqual([NOW, 'rt1', 't1']);
      const ins = query.mock.calls.find((c) => String(c[0]).includes('INSERT'))!;
      expect(ins[1][5]).toBe(sha(out.newToken));
      expect(ins[1][6]).toBe('fam');
      expect(ins[1][7]).toBe('rt1');
      expect(ins[1][8]).toEqual(new Date(NOW.getTime() + 30 * DAY));
      expect(ins[1].slice(9)).toEqual(['1.1.1.1', 'ua']);
      expect(out.accessTokenPayload).toEqual({ sub: 'u1', email: 'a@b.c', tenantId: 't1', sessionId: 's1', scope: 'openid' });
      expect(out.newToken).not.toBe('plain');
    });

    it('handles optional fields absent', async () => {
      const { svc, query } = setup();
      route(query, stored({ client_id: null, scope: null, userEmail: null }));
      const out = await svc.rotateRefreshToken({ tenantId: 't1', token: 'plain' });
      const ins = query.mock.calls.find((c) => String(c[0]).includes('INSERT'))!;
      expect(ins[1][3]).toBeNull();
      expect(ins[1][4]).toBeNull();
      expect(ins[1].slice(9)).toEqual([null, null]);
      expect(out.accessTokenPayload.email).toBe('');
    });

    it('rejects unknown token', async () => {
      const { svc, query } = setup();
      route(query, undefined);
      expect(await code(svc.rotateRefreshToken(p))).toBe('AUTH_TOKEN_INVALID');
    });

    it('REUSE: revokes whole family and rejects with AUTH_REFRESH_REUSED', async () => {
      const { svc, query } = setup();
      route(query, stored({ used_at: new Date(NOW.getTime() - 1000) }));
      expect(await code(svc.rotateRefreshToken(p))).toBe('AUTH_REFRESH_REUSED');
      const rev = query.mock.calls.find((c) => String(c[0]).includes('family_id = $3'))!;
      expect(rev[1]).toEqual([NOW, 'family_revoked_reuse_detection', 'fam', 't1']);
      expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false);
    });

    it('reuse is detected even if the token was also revoked/expired (reuse wins)', async () => {
      const { svc, query } = setup();
      route(query, stored({ used_at: NOW, revoked_at: NOW, expires_at: new Date(NOW.getTime() - 1) }));
      expect(await code(svc.rotateRefreshToken(p))).toBe('AUTH_REFRESH_REUSED');
    });

    it('rejects revoked token', async () => {
      const { svc, query } = setup();
      route(query, stored({ revoked_at: NOW }));
      expect(await code(svc.rotateRefreshToken(p))).toBe('AUTH_SESSION_REVOKED');
    });

    it('rejects expired token (boundary: now-1ms expired, exactly now still valid)', async () => {
      const a = setup();
      route(a.query, stored({ expires_at: new Date(NOW.getTime() - 1) }));
      expect(await code(a.svc.rotateRefreshToken(p))).toBe('AUTH_TOKEN_EXPIRED');
      const b = setup();
      route(b.query, stored({ expires_at: new Date(NOW.getTime()) }));
      await expect(b.svc.rotateRefreshToken(p)).resolves.toBeDefined();
    });

    it('rejects when session is revoked or missing', async () => {
      const a = setup();
      route(a.query, stored(), { id: 's1', revoked_at: NOW });
      expect(await code(a.svc.rotateRefreshToken(p))).toBe('AUTH_SESSION_REVOKED');
      const b = setup();
      route(b.query, stored(), null);
      expect(await code(b.svc.rotateRefreshToken(p))).toBe('AUTH_SESSION_REVOKED');
      expect(b.query.mock.calls.some((c) => String(c[0]).includes('SET used_at'))).toBe(false);
    });

    it('token lookup is tenant-scoped (cross-tenant replay finds nothing)', async () => {
      const { svc, query } = setup();
      route(query, undefined);
      await code(svc.rotateRefreshToken({ ...p, tenantId: 'other' }));
      expect(query.mock.calls[0]?.[0]).toContain('t.tenant_id = $1');
      expect(query.mock.calls[0]?.[1][0]).toBe('other');
    });

    // BUG oauth-refresh-token.service.ts rotateRefreshToken: "used_at" UPDATE has no `AND used_at IS NULL`
    // guard and the read/check/update is not atomic, so two concurrent rotations of one token both succeed.
    it('marks used atomically (UPDATE guarded by used_at IS NULL)', async () => {
      const { svc, query } = setup();
      route(query, stored());
      await svc.rotateRefreshToken(p);
      const upd = query.mock.calls.find((c) => String(c[0]).includes('SET used_at'))!;
      expect(String(upd[0])).toContain('used_at IS NULL');
    });
  });

  describe('rotation atomicity', () => {
    const p = { tenantId: 't1', token: 'plain', ipAddress: '1.1.1.1', userAgent: 'ua' };
    it('treats 0 affected rows as reuse: revokes the family and issues no new token', async () => {
      const { svc, query } = setup();
      route(query, stored());
      const base = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string, ...rest: unknown[]) =>
        sql.includes('SET used_at') ? [[], 0] : base(sql, ...rest));
      expect(await code(svc.rotateRefreshToken(p))).toBe('AUTH_REFRESH_REUSED');
      const sqls = query.mock.calls.map((c) => String(c[0]));
      expect(sqls.some((q) => q.includes('family_id = $3'))).toBe(true);
      expect(sqls.some((q) => q.includes('INSERT INTO'))).toBe(false);
    });

    it('two parallel rotations of one token: exactly one succeeds, the other revokes the family', async () => {
      const { svc, query } = setup();
      let used = false; // emulates the row-level guard in Postgres
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('LEFT JOIN')) return [stored()];
        if (sql.includes('"sessions"')) return [{ id: 's1', revoked_at: null }];
        if (sql.includes('SET used_at')) {
          if (!sql.includes('used_at IS NULL') || used) return [[], 0];
          used = true;
          return [[], 1];
        }
        return [];
      });
      const results = await Promise.allSettled([svc.rotateRefreshToken(p), svc.rotateRefreshToken(p)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect((rejected.reason as ApiException).code).toBe('AUTH_REFRESH_REUSED');
      const sqls = query.mock.calls.map((c) => String(c[0]));
      expect(sqls.filter((q) => q.includes('INSERT INTO'))).toHaveLength(1);
      expect(sqls.some((q) => q.includes('family_revoked') || q.includes('family_id = $3'))).toBe(true);
    });
  });

  describe('revocations & queries', () => {
    it('revokeToken is tenant scoped with default reason', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([]);
      await svc.revokeToken('hash', 't1');
      expect(query.mock.calls[0]?.[1]).toEqual([NOW, 'manual_revocation', 'hash', 't1']);
    });
    it('revokeTokenFamily handles missing result counts', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([]);
      await expect(svc.revokeTokenFamily('fam', 't1')).resolves.toBeUndefined();
      query.mockResolvedValue([[], 3]);
      await expect(svc.revokeTokenFamily('fam', 't1')).resolves.toBeUndefined();
      expect(query.mock.calls[0]?.[1]).toEqual([NOW, 'family_revoked_reuse_detection', 'fam', 't1']);
    });
    it('revokeAllUserTokens / revokeSessionTokens only touch unrevoked rows for the tenant', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([]);
      await svc.revokeAllUserTokens('u1', 't1');
      await svc.revokeSessionTokens('s1', 't1');
      expect(query.mock.calls[0]?.[1]).toEqual([NOW, 'user_logout_all', 'u1', 't1']);
      expect(query.mock.calls[1]?.[1]).toEqual([NOW, 'session_logout', 's1', 't1']);
      query.mock.calls.forEach((c) => expect(String(c[0])).toContain('revoked_at IS NULL'));
    });
    it('getUserTokens maps rows', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([
        { id: '1', tenant_id: 't1', user_id: 'u', session_id: 's', client_id: 'c', scope: 'x', token_hash: 'h', family_id: 'f', parent_token_id: 'p', expires_at: NOW, created_at: NOW },
        { id: '2', expires_at: null, created_at: null },
      ]);
      const out = await svc.getUserTokens('u', 't1');
      expect(out[0]).toMatchObject({ id: '1', tenantId: 't1', familyId: 'f', expiresAt: NOW });
      expect(out[1]?.expiresAt).toBeNull();
      expect(out[1]?.createdAt).toBeNull();
      expect(query.mock.calls[0]?.[1]).toEqual(['u', 't1']);
    });
    it('cleanupExpiredTokens deletes for a tenant and returns count; 0 without tenant', async () => {
      const { svc, query } = setup();
      query.mockResolvedValue([[], 4]);
      await expect(svc.cleanupExpiredTokens('t1')).resolves.toBe(4);
      query.mockResolvedValue([]);
      await expect(svc.cleanupExpiredTokens('t1')).resolves.toBe(0);
      query.mockClear();
      await expect(svc.cleanupExpiredTokens()).resolves.toBe(0);
      expect(query).not.toHaveBeenCalled();
    });
  });
});

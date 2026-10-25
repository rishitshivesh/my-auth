import { TenantRegistrationService, RegisterTenantDto } from './tenant-registration.service';
import { assertPasswordPolicy } from '../auth/password-policy';
import { hashPassword } from '../auth/password-hashing';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../auth/password-policy', () => ({ assertPasswordPolicy: jest.fn() }));
jest.mock('../auth/password-hashing', () => ({ hashPassword: jest.fn(async () => 'HASH') }));
jest.mock('./tenant.service', () => ({ TenantService: class TenantService {} }));
jest.mock('@/common/service/session.service', () => ({ SessionService: class SessionService {} }));
jest.mock('@/modules/oauth/services/jwks.service', () => ({ JwksService: class JwksService {} }));
jest.mock('@/modules/oauth/services/oauth-refresh-token.service', () => ({ OAuthRefreshTokenService: class OAuthRefreshTokenService {} }));
jest.mock('@/common/service/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('@/core/tenant/tenant-schema.service', () => ({ TenantSchemaService: class TenantSchemaService {} }));
jest.mock('@/core/database/tenant-context.service', () => ({ TenantContextService: class TenantContextService {} }));

const repo = () => ({ findOne: jest.fn(), create: jest.fn((x: unknown) => ({ ...(x as object) })), save: jest.fn(), delete: jest.fn() });

function build() {
  const user = repo(), tenant = repo(), role = repo(), userRole = repo(), policy = repo(), rolePolicy = repo();
  let n = 0;
  user.save.mockImplementation(async (x: object) => ({ id: 'u1', ...x }));
  role.save.mockImplementation(async (x: object) => ({ id: `r${++n}`, ...x }));
  policy.save.mockImplementation(async (x: object) => ({ id: `p${++n}`, ...x }));
  rolePolicy.save.mockImplementation(async (x: object) => x);
  userRole.save.mockImplementation(async (x: object) => x);
  tenant.findOne.mockResolvedValue(null);
  tenant.delete.mockResolvedValue(undefined);

  const qr = {
    connect: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) })) },
  };
  const dataSource = { createQueryRunner: jest.fn(() => qr), query: jest.fn().mockResolvedValue(undefined) };
  const tenantService = { create: jest.fn().mockResolvedValue({ id: 'tn1', slug: 'acme' }) };
  const sessionService = { createSession: jest.fn().mockResolvedValue({ id: 's1' }) };
  const jwks = {
    ensureTenantKeyExists: jest.fn().mockResolvedValue(undefined),
    getCurrentSigningKey: jest.fn().mockResolvedValue({ kid: 'k1', privateKey: { export: jest.fn(() => 'PEM') } }),
    deleteTenantKeys: jest.fn().mockResolvedValue(undefined),
  };
  const refresh = { createRefreshToken: jest.fn().mockResolvedValue({ token: 'RT' }) };
  const jwt = { sign: jest.fn(() => 'AT') };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  const schema = { getSchemaName: jest.fn((s: string) => `fk_${s}`) };
  const ctxSvc = { run: jest.fn(async (_c: unknown, fn: () => Promise<unknown>) => fn()) };
  const svc = new TenantRegistrationService(
    user as never, tenant as never, role as never, userRole as never, policy as never, rolePolicy as never,
    tenantService as never, sessionService as never, jwks as never, refresh as never, jwt as never,
    redis as never, schema as never, ctxSvc as never, dataSource as never,
  );
  return { svc, user, tenant, role, userRole, policy, rolePolicy, qr, dataSource, tenantService, sessionService, jwks, refresh, jwt, redis, ctxSvc };
}

const dto = (o: Partial<RegisterTenantDto> = {}): RegisterTenantDto => ({
  workspaceName: 'Acme', slug: 'acme', adminName: 'Ada Lovelace King', adminEmail: 'ada@acme.io', adminPassword: 'Str0ng!Pass', idempotencyKey: 'k'.repeat(8), ...o,
});

describe('TenantRegistrationService.checkSlugAvailability', () => {
  it.each([
    ['abc', 'at least 4'],
    ['x'.repeat(64), '63 characters'],
    ['Acme1', 'lowercase'],
    ['ac_me', 'lowercase'],
    ['ac me', 'lowercase'],
    ['-acme', 'hyphen'],
    ['acme-', 'hyphen'],
    ['admin', 'reserved'],
    ['portal', 'reserved'],
  ])('rejects %p', async (slug, reason) => {
    const b = build();
    const r = await b.svc.checkSlugAvailability(slug);
    expect(r.available).toBe(false);
    expect(r.reason).toContain(reason);
    expect(b.tenant.findOne).not.toHaveBeenCalled();
  });

  it('accepts 4 and 63 char boundaries', async () => {
    const b = build();
    expect((await b.svc.checkSlugAvailability('abcd')).available).toBe(true);
    expect((await b.svc.checkSlugAvailability('a'.repeat(63))).available).toBe(true);
  });

  it('rejects when reserved in redis by someone else', async () => {
    const b = build();
    b.redis.get.mockResolvedValue('pending');
    expect(await b.svc.checkSlugAvailability('acme')).toEqual({ available: false, reason: expect.stringContaining('claimed') });
  });

  it('rejects taken slug; reserves free slug for 300s', async () => {
    const b = build();
    b.tenant.findOne.mockResolvedValue({ id: 'x' });
    expect((await b.svc.checkSlugAvailability('acme')).reason).toContain('taken');
    expect(b.redis.set).not.toHaveBeenCalled();
    b.tenant.findOne.mockResolvedValue(null);
    expect(await b.svc.checkSlugAvailability('acme')).toEqual({ available: true });
    expect(b.redis.set).toHaveBeenCalledWith('', '', 'common:slug:reservation:acme', 'pending', 300);
  });

  it('fails open when redis is down (get/set rejections swallowed)', async () => {
    const b = build();
    b.redis.get.mockRejectedValue(new Error('down'));
    b.redis.set.mockRejectedValue(new Error('down'));
    expect(await b.svc.checkSlugAvailability('acme')).toEqual({ available: true });
  });
});

describe('TenantRegistrationService.registerTenant', () => {
  beforeEach(() => jest.clearAllMocks());

  it('happy path: provisions tenant, owner, system roles/policies, session, tokens', async () => {
    const b = build();
    const out = await b.svc.registerTenant(dto(), '1.2.3.4', 'UA');
    expect(out).toEqual({ accessToken: 'AT', refreshToken: 'RT', tenantSlug: 'acme', user: { id: 'u1', email: 'ada@acme.io', name: 'Ada Lovelace King' } });

    expect(assertPasswordPolicy).toHaveBeenCalledWith('Str0ng!Pass', { email: 'ada@acme.io' });
    expect(hashPassword).toHaveBeenCalledWith('Str0ng!Pass');
    expect(b.user.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tn1', passwordHash: 'HASH', firstName: 'Ada', lastName: 'Lovelace King', emailVerified: true, mfaEnabled: false }));
    expect(b.role.save).toHaveBeenCalledTimes(3);
    expect(b.policy.save).toHaveBeenCalledTimes(3);
    expect(b.rolePolicy.save).toHaveBeenCalledTimes(3);
    expect(b.userRole.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', tenantId: 'tn1' }));
    expect(b.qr.startTransaction).toHaveBeenCalled();
    expect(b.qr.commitTransaction).toHaveBeenCalled();
    expect(b.qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(b.qr.release).toHaveBeenCalled();
    expect(b.sessionService.createSession).toHaveBeenCalledWith({ userId: 'u1', tenantId: 'tn1', email: 'ada@acme.io', ipAddress: '1.2.3.4', userAgent: 'UA', amr: ['pwd'] });
    expect(b.refresh.createRefreshToken).toHaveBeenCalledWith(expect.objectContaining({ expiresInDays: 30, sessionId: 's1', tenantId: 'tn1' }));
    expect(b.jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', tenantId: 'tn1', tenantSlug: 'acme', groups: ['owner'], sessionId: 's1' }),
      expect.objectContaining({ algorithm: 'RS256', privateKey: 'PEM', expiresIn: '15m', header: { alg: 'RS256', kid: 'k1' } }),
    );
    // advisory lock taken and released
    const sqls = b.qr.query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('pg_advisory_lock'))).toBe(true);
    expect(sqls.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
    expect(b.qr.query).toHaveBeenCalledWith(expect.stringContaining('"fk_acme"'));
  });

  it('single-word admin name leaves lastName undefined', async () => {
    const b = build();
    await b.svc.registerTenant(dto({ adminName: 'Ada' }), 'ip', 'ua');
    expect(b.user.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Ada', lastName: undefined }));
  });

  it('unavailable slug -> RESOURCE_CONFLICT before touching DB', async () => {
    const b = build();
    await expect(b.svc.registerTenant(dto({ slug: 'admin' }), 'ip', 'ua')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT', detail: 'This slug is reserved' });
    expect(b.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('weak password propagates and creates nothing', async () => {
    const b = build();
    (assertPasswordPolicy as jest.Mock).mockImplementationOnce(() => { throw Object.assign(new Error('weak'), { code: 'VALIDATION_FAILED' }); });
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(b.tenantService.create).not.toHaveBeenCalled();
  });

  it('slug taken inside the lock -> conflict, no cleanup (tenant not created), lock released', async () => {
    const b = build();
    b.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 'x' }) });
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    expect(b.tenantService.create).not.toHaveBeenCalled();
    expect(b.dataSource.query).not.toHaveBeenCalled();
    expect(b.qr.query.mock.calls.some((c) => String(c[0]).includes('pg_advisory_unlock'))).toBe(true);
    expect(b.qr.release).toHaveBeenCalled();
  });

  it('failure inside transaction rolls back, drops schema, deletes keys and tenant, rethrows original', async () => {
    const b = build();
    const boom = new Error('role insert failed');
    b.role.save.mockRejectedValue(boom);
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toBe(boom);
    expect(b.qr.rollbackTransaction).toHaveBeenCalled();
    expect(b.dataSource.query).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "fk_acme" CASCADE');
    expect(b.jwks.deleteTenantKeys).toHaveBeenCalledWith('tn1');
    expect(b.tenant.delete).toHaveBeenCalledWith({ id: 'tn1' });
    expect(b.sessionService.createSession).not.toHaveBeenCalled();
    expect(b.qr.release).toHaveBeenCalled();
  });

  it('failure after commit does not attempt rollback of a closed transaction but still cleans up', async () => {
    const b = build();
    b.sessionService.createSession.mockRejectedValue(new Error('redis'));
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toThrow('redis');
    expect(b.qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(b.tenant.delete).toHaveBeenCalled();
  });

  it('tenant creation failure: no tenant to clean, error propagates', async () => {
    const b = build();
    b.tenantService.create.mockRejectedValue(new Error('schema'));
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toThrow('schema');
    expect(b.dataSource.query).not.toHaveBeenCalled();
    expect(b.tenant.delete).not.toHaveBeenCalled();
  });

  it('cleanup errors never mask the original error; rollback/unlock/reset failures tolerated', async () => {
    const b = build();
    const boom = new Error('orig');
    b.policy.save.mockRejectedValue(boom);
    b.qr.rollbackTransaction.mockRejectedValue(new Error('rb'));
    b.dataSource.query.mockRejectedValue(new Error('drop'));
    b.jwks.deleteTenantKeys.mockRejectedValue(new Error('keys'));
    b.tenant.delete.mockRejectedValue(new Error('del'));
    let calls = 0;
    b.qr.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('unlock') || (String(sql) === 'SET search_path TO public' && ++calls)) throw new Error('x');
    });
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).rejects.toBe(boom);
    expect(b.qr.release).toHaveBeenCalled();
  });

  // BUG: tenant-registration.service.ts registerTenant() calls checkSlugAvailability(), which reserves the
  // slug in Redis for 300s. The onboarding wizard calls slug-check first (creating that reservation), so the
  // subsequent register call sees its own reservation and fails with "being claimed by another user".
  it('registration succeeds after the same client has just run slug-check', async () => {
    const b = build();
    const store = new Map<string, string>();
    b.redis.get.mockImplementation(async (_a: string, _b: string, k: string) => store.get(k) ?? null);
    b.redis.set.mockImplementation(async (_a: string, _b: string, k: string, v: string) => { store.set(k, v); });
    await b.svc.checkSlugAvailability('acme');
    await expect(b.svc.registerTenant(dto(), 'ip', 'ua')).resolves.toBeDefined();
  });
});

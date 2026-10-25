import { UserService } from './user.service';
import { createHash } from 'crypto';
import { verifyPassword, hashPassword } from '../auth/password-hashing';
import { assertPasswordPolicy } from '../auth/password-policy';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../auth/password-hashing', () => ({ verifyPassword: jest.fn(), hashPassword: jest.fn(async () => 'NEWHASH') }));
jest.mock('../auth/password-policy', () => ({ assertPasswordPolicy: jest.fn() }));
jest.mock('@/core/database/session.repository', () => ({ SessionRepository: class SessionRepository {} }));
jest.mock('@/common/service/security-event.service', () => ({ SecurityEventService: class SecurityEventService {} }));
jest.mock('@/modules/email/email.service', () => ({ EmailService: class EmailService {} }));
jest.mock('./user.repository', () => ({ UserRepository: class UserRepository {} }));
jest.mock('@/common/service/password-change-effects.service', () => ({ PasswordChangeEffectsService: class PasswordChangeEffectsService {} }));

const NOW = new Date('2025-06-01T00:00:00Z');

function qb(result: unknown, many: unknown[] = []) {
  const q = {
    addSelect: jest.fn(), where: jest.fn(), andWhere: jest.fn(), leftJoinAndSelect: jest.fn(), leftJoin: jest.fn(),
    orderBy: jest.fn(), addOrderBy: jest.fn(), skip: jest.fn(), take: jest.fn(),
    getOne: jest.fn().mockResolvedValue(result), getMany: jest.fn().mockResolvedValue(many), getCount: jest.fn().mockResolvedValue(many.length),
  };
  for (const k of ['addSelect', 'where', 'andWhere', 'leftJoinAndSelect', 'leftJoin', 'orderBy', 'addOrderBy', 'skip', 'take'] as const) q[k].mockReturnValue(q);
  return q;
}

function build() {
  const userRepo = {
    findByTenantAndId: jest.fn(), findOne: jest.fn(), find: jest.fn(), count: jest.fn(), save: jest.fn(), update: jest.fn(), softDelete: jest.fn(),
    createQueryBuilder: jest.fn(), isLastOwnerLevelHolder: jest.fn().mockResolvedValue(false), getMaxRolePriority: jest.fn().mockResolvedValue(0),
    getRolePriorities: jest.fn(), getUserOrgs: jest.fn(),
  };
  const sessions = { find: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const events = { find: jest.fn() };
  const invites = { findOne: jest.fn(), find: jest.fn(), delete: jest.fn(), create: jest.fn((x: Record<string, unknown>) => x), save: jest.fn() };
  const tenants = { findOne: jest.fn() };
  const sec = { log: jest.fn() };
  const email = { sendAccountDeletedEmail: jest.fn(), sendInviteEmail: jest.fn() };
  const config = { get: jest.fn() };
  const effects = { afterPasswordChange: jest.fn() };
  const svc = new UserService(userRepo as never, sessions as never, events as never, invites as never, tenants as never, sec as never, email as never, config as never, effects as never);
  return { svc, userRepo, sessions, events, invites, tenants, sec, email, config, effects };
}
const ctx = { ip: '1.1.1.1', userAgent: 'ua', requestId: 'r', sessionId: 's' };

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('lookup', () => {
    it('findById 404 / found', async () => {
      const b = build();
      b.userRepo.findByTenantAndId.mockResolvedValueOnce(null);
      await expect(b.svc.findById('t', 'u')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      b.userRepo.findByTenantAndId.mockResolvedValueOnce({ id: 'u' });
      expect(await b.svc.findById('t', 'u')).toEqual({ id: 'u' });
    });
    it('findByEmail scopes by tenant only when given', async () => {
      const b = build();
      await b.svc.findByEmail('t', 'a@b.c');
      expect(b.userRepo.findOne).toHaveBeenLastCalledWith({ where: { email: 'a@b.c', tenantId: 't' }, relations: ['tenant', 'mfaSettings'] });
      await b.svc.findByEmail('', 'a@b.c');
      expect(b.userRepo.findOne).toHaveBeenLastCalledWith({ where: { email: 'a@b.c' }, relations: ['tenant', 'mfaSettings'] });
    });
  });

  describe('update / adminUpdate', () => {
    it('applies fields, logs changed field names', async () => {
      const b = build();
      const user = { tenantId: 't', email: 'e' };
      b.userRepo.findByTenantAndId.mockResolvedValue(user);
      const out = await b.svc.update('t', 'u', { firstName: 'A', timezone: 'UTC' });
      expect(out).toMatchObject({ firstName: 'A', timezone: 'UTC' });
      expect(b.userRepo.save).toHaveBeenCalledWith(user);
      expect(b.sec.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { fields: ['firstName', 'timezone'] }, userId: 'u' }));
    });
    it('adminUpdate enforces hierarchy before changing anything', async () => {
      const b = build();
      b.userRepo.findByTenantAndId.mockResolvedValue({ tenantId: 't', email: 'e' });
      b.userRepo.getMaxRolePriority.mockResolvedValue(100);
      await expect(b.svc.adminUpdate('t', 'u', 'actor', { firstName: 'X' })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
      expect(b.userRepo.save).not.toHaveBeenCalled();
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'actor' ? 900 : 100));
      await b.svc.adminUpdate('t', 'u', 'actor', { firstName: 'X' });
      expect(b.userRepo.save).toHaveBeenCalled();
    });
    it('adminUpdate on self skips rank lookup; missing target 404', async () => {
      const b = build();
      b.userRepo.findByTenantAndId.mockResolvedValue({ tenantId: 't', email: 'e' });
      await b.svc.adminUpdate('t', 'me', 'me', {});
      expect(b.userRepo.getMaxRolePriority).not.toHaveBeenCalled();
      b.userRepo.findByTenantAndId.mockResolvedValue(null);
      await expect(b.svc.adminUpdate('t', 'x', 'me', {})).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('changePassword', () => {
    const user = (over: object = {}) => ({ id: 'u', tenantId: 't', email: 'e@x.io', passwordHash: 'H0', passwordHistory: ['H1', 'H2'], ...over });
    const run = (b: ReturnType<typeof build>) => b.svc.changePassword('t', 'u', 'old', 'NewPass1!', ctx);

    it('404 when user missing', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(null));
      await expect(run(b)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
    it('wrong current password -> logged + AUTH_INVALID_CREDENTIALS, nothing updated', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(user()));
      (verifyPassword as jest.Mock).mockResolvedValue(false);
      await expect(run(b)).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
      expect(b.sec.log).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
      expect(b.userRepo.update).not.toHaveBeenCalled();
    });
    it('rejects reused password from history', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(user()));
      (verifyPassword as jest.Mock).mockImplementation(async (hash: string) => hash === 'H0' || hash === 'H2');
      await expect(run(b)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(hashPassword).not.toHaveBeenCalled();
    });
    it('policy failure propagates', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(user()));
      (verifyPassword as jest.Mock).mockImplementation(async (hash: string) => hash === 'H0');
      (assertPasswordPolicy as jest.Mock).mockImplementationOnce(() => { throw new Error('policy'); });
      await expect(run(b)).rejects.toThrow('policy');
    });
    it('success: history keeps newest 5 with old hash first, effects invoked', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(user({ passwordHistory: ['a', 'b', 'c', 'd', 'e'] })));
      (verifyPassword as jest.Mock).mockImplementation(async (hash: string) => hash === 'H0');
      await run(b);
      expect(b.userRepo.update).toHaveBeenCalledWith('u', { passwordHash: 'NEWHASH', passwordHistory: ['H0', 'a', 'b', 'c', 'd'], passwordChangedAt: NOW, forcePasswordChange: false });
      expect(b.effects.afterPasswordChange).toHaveBeenCalledWith(expect.objectContaining({ keepSessionId: 's', requestId: 'r', reason: 'password_change', ip: '1.1.1.1' }));
    });
    it('passwordless (social) account may set a first password; null history ok', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(user({ passwordHash: null, passwordHistory: null })));
      await run(b);
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(b.userRepo.update).toHaveBeenCalledWith('u', expect.objectContaining({ passwordHistory: [] }));
    });
  });

  describe('sessions & events', () => {
    it('getActiveSessions filters revoked/expired and maps safe fields', async () => {
      const b = build();
      b.sessions.find.mockResolvedValue([{ id: 's', deviceInfo: 'd', ipAddress: 'i', location: 'l', lastActivity: NOW, createdAt: NOW, refreshTokenHash: 'SECRET' }]);
      const out = await b.svc.getActiveSessions('t', 'u');
      expect(out).toEqual([{ id: 's', deviceInfo: 'd', ipAddress: 'i', location: 'l', lastActivity: NOW, createdAt: NOW }]);
      const arg = b.sessions.find.mock.calls[0][0];
      expect(arg.where).toMatchObject({ userId: 'u', tenantId: 't' });
      expect(arg.where.expiresAt.value).toEqual(NOW);
    });
    it('revokeSession 404 for foreign session; revokes and logs otherwise', async () => {
      const b = build();
      b.sessions.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.revokeSession('t', 'u', 's')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      expect(b.sessions.findOne).toHaveBeenCalledWith({ where: { id: 's', userId: 'u', tenantId: 't' } });
      b.sessions.findOne.mockResolvedValueOnce({});
      await b.svc.revokeSession('t', 'u', 's');
      expect(b.sessions.update).toHaveBeenCalledWith('s', { revokedAt: NOW, revokedReason: 'manual_revocation' });
      expect(b.sec.log).toHaveBeenCalled();
    });
    it('revokeAllSessions', async () => {
      const b = build();
      await b.svc.revokeAllSessions('t', 'u');
      expect(b.sessions.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u', tenantId: 't' }), { revokedAt: NOW, revokedReason: 'user_request' });
    });
    it('getSecurityEvents maps and honors limit', async () => {
      const b = build();
      b.events.find.mockResolvedValue([{ id: 'e', eventType: 'X', severity: 'info', ipAddress: 'i', location: 'l', metadata: {}, createdAt: NOW, userAgent: 'hidden' }]);
      const out = await b.svc.getSecurityEvents('t', 'u');
      expect(out[0]).not.toHaveProperty('userAgent');
      expect(b.events.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50, where: { userId: 'u', tenantId: 't' } }));
      await b.svc.getSecurityEvents('t', 'u', 5);
      expect(b.events.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  describe('deleteAccount', () => {
    it('404, wrong password (logged), last owner, success', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(null));
      await expect(b.svc.deleteAccount('t', 'u', 'pw')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

      b.userRepo.createQueryBuilder.mockReturnValue(qb({ tenantId: 't', email: 'e', passwordHash: 'H' }));
      (verifyPassword as jest.Mock).mockResolvedValueOnce(false);
      await expect(b.svc.deleteAccount('t', 'u', 'pw')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
      expect(b.userRepo.softDelete).not.toHaveBeenCalled();

      (verifyPassword as jest.Mock).mockResolvedValue(true);
      b.userRepo.isLastOwnerLevelHolder.mockResolvedValueOnce(true);
      await expect(b.svc.deleteAccount('t', 'u', 'pw')).rejects.toMatchObject({ code: 'LAST_OWNER' });
      expect(b.userRepo.softDelete).not.toHaveBeenCalled();

      await b.svc.deleteAccount('t', 'u', 'pw', 'req');
      expect(b.userRepo.softDelete).toHaveBeenCalledWith('u');
      expect(b.sessions.update).toHaveBeenCalledWith(expect.anything(), { revokedAt: NOW, revokedReason: 'account_deleted' });
      expect(b.email.sendAccountDeletedEmail).toHaveBeenCalled();
      expect(b.sec.log).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical', requestId: 'req' }));
    });
    it('passwordless account verifies against empty hash', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb({ tenantId: 't', email: 'e', passwordHash: null }));
      (verifyPassword as jest.Mock).mockResolvedValue(false);
      await expect(b.svc.deleteAccount('t', 'u', 'pw')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
      expect(verifyPassword).toHaveBeenCalledWith('', 'pw');
    });
  });

  describe('lockout', () => {
    it('isAccountLocked boundaries', async () => {
      const b = build();
      b.userRepo.findByTenantAndId.mockResolvedValueOnce({}).mockResolvedValueOnce({ lockedUntil: new Date(NOW.getTime() + 1) }).mockResolvedValueOnce({ lockedUntil: NOW }).mockResolvedValueOnce({ lockedUntil: new Date(NOW.getTime() - 1) });
      expect(await b.svc.isAccountLocked('t', 'u')).toBe(false);
      expect(await b.svc.isAccountLocked('t', 'u')).toBe(true);
      expect(await b.svc.isAccountLocked('t', 'u')).toBe(false);
      expect(await b.svc.isAccountLocked('t', 'u')).toBe(false);
    });
    it('incrementFailedAttempts locks at 5th failure for 15 minutes only', async () => {
      const b = build();
      b.userRepo.findByTenantAndId.mockResolvedValueOnce({ tenantId: 't', email: 'e', failedLoginAttempts: 3 });
      await b.svc.incrementFailedAttempts('t', 'u');
      expect(b.userRepo.update).toHaveBeenLastCalledWith('u', { failedLoginAttempts: 4 });
      expect(b.sec.log).not.toHaveBeenCalled();
      b.userRepo.findByTenantAndId.mockResolvedValueOnce({ tenantId: 't', email: 'e', failedLoginAttempts: 4 });
      await b.svc.incrementFailedAttempts('t', 'u');
      expect(b.userRepo.update).toHaveBeenLastCalledWith('u', { failedLoginAttempts: 5, lockedUntil: new Date(NOW.getTime() + 15 * 60_000) });
      expect(b.sec.log).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical', metadata: { attempts: 5 } }));
    });
    it('reset / updateLastLogin', async () => {
      const b = build();
      await b.svc.resetFailedAttempts('t', 'u');
      expect(b.userRepo.update).toHaveBeenLastCalledWith('u', { failedLoginAttempts: 0, lockedUntil: null });
      await b.svc.updateLastLogin('t', 'u', '9.9.9.9');
      expect(b.userRepo.update).toHaveBeenLastCalledWith('u', expect.objectContaining({ lastLoginAt: NOW, lastLoginIp: '9.9.9.9', failedLoginAttempts: 0 }));
    });

    it('resetFailedAttempts clears lockedUntil with null', async () => {
      const b = build();
      await b.svc.resetFailedAttempts('t', 'u');
      expect(b.userRepo.update).toHaveBeenCalledWith('u', expect.objectContaining({ lockedUntil: null }));
    });
  });

  describe('listUsers', () => {
    it('defaults, pagination metadata, tenant scoping, tenant projection', async () => {
      const b = build();
      const users = [{ id: 'u', email: 'e', createdAt: NOW, updatedAt: NOW, tenant: { id: 't', name: 'N', slug: 's', secret: 'x' }, passwordHash: 'H' }, { id: 'v', email: 'f', createdAt: NOW, updatedAt: NOW }];
      const q = qb(null, users);
      q.getCount.mockResolvedValue(45);
      b.userRepo.createQueryBuilder.mockReturnValue(q);
      const out = await b.svc.listUsers('t');
      expect(q.where).toHaveBeenCalledWith('user.tenantId = :tenantId', { tenantId: 't' });
      expect(q.skip).toHaveBeenCalledWith(0);
      expect(q.take).toHaveBeenCalledWith(20);
      expect(q.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
      expect(out.pagination).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3, hasNextPage: true, hasPreviousPage: false });
      expect(out.users[0]).not.toHaveProperty('passwordHash');
      expect(out.users[0]?.tenant).toEqual({ id: 't', name: 'N', slug: 's' });
      expect(out.users[1]?.tenant).toBeUndefined();
    });
    it.each([
      [{ page: 0, limit: 0 }, 1, 20], [{ page: -4, limit: -1 }, 1, 1], [{ page: 3, limit: 1000 }, 3, 100], [{ page: 2, limit: 7 }, 2, 7],
    ])('clamps %j', async (opts, page, limit) => {
      const b = build();
      const q = qb(null, []);
      b.userRepo.createQueryBuilder.mockReturnValue(q);
      const out = await b.svc.listUsers('t', opts);
      expect(out.pagination).toMatchObject({ page, limit, hasPreviousPage: page > 1, hasNextPage: false });
      expect(q.skip).toHaveBeenCalledWith((page - 1) * limit);
    });
    it('rejects non-whitelisted sort fields (injection guard)', async () => {
      const b = build();
      await expect(b.svc.listUsers('t', { sortBy: 'passwordHash; --' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(b.svc.listUsers('t', { sortBy: 'passwordHash' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(b.userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
    it('applies every filter parametrically', async () => {
      const b = build();
      const q = qb(null, []);
      b.userRepo.createQueryBuilder.mockReturnValue(q);
      const d1 = new Date(1), d2 = new Date(2);
      await b.svc.listUsers('t', { search: "x'; --", isActive: false, emailVerified: false, createdAfter: d1, createdBefore: d2, role: 'admin', sortBy: 'email', sortOrder: 'ASC' });
      expect(q.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { search: "%x'; --%" });
      expect(q.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: false });
      expect(q.andWhere).toHaveBeenCalledWith('user.emailVerified = :emailVerified', { emailVerified: false });
      expect(q.andWhere).toHaveBeenCalledWith('user.createdAt >= :createdAfter', { createdAfter: d1 });
      expect(q.andWhere).toHaveBeenCalledWith('user.createdAt <= :createdBefore', { createdBefore: d2 });
      expect(q.andWhere).toHaveBeenCalledWith('role.name = :role', { role: 'admin' });
      expect(q.orderBy).toHaveBeenCalledWith('user.email', 'ASC');
    });
  });

  it('getUserStats computes derived counts and 7-day window', async () => {
    const b = build();
    b.userRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(7).mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    expect(await b.svc.getUserStats('t')).toEqual({ total: 10, active: 7, inactive: 3, verified: 4, unverified: 6, recentLogins: 2 });
    const where = b.userRepo.count.mock.calls[3][0].where;
    expect(where.lastLoginAt.value).toEqual(new Date(NOW.getTime() - 7 * 86_400_000));
  });

  describe('bulkUpdateActiveStatus', () => {
    it('empty list is a no-op', async () => {
      const b = build();
      expect(await b.svc.bulkUpdateActiveStatus('t', [], true, 'a')).toEqual({ updated: 0 });
      expect(b.userRepo.find).not.toHaveBeenCalled();
    });
    it('rejects when any id is foreign/unknown', async () => {
      const b = build();
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'adm' ? 900 : 100));
      b.userRepo.find.mockResolvedValue([{ id: 'a' }]);
      await expect(b.svc.bulkUpdateActiveStatus('t', ['a', 'b'], true, 'adm')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(b.userRepo.update).not.toHaveBeenCalled();
    });
    it.each([[true], [false]])('isActive=%s updates and logs per user', async (flag) => {
      const b = build();
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'adm' ? 900 : 100));
      b.userRepo.find.mockResolvedValue([{ id: 'a', email: 'x' }, { id: 'b', email: 'y' }]);
      b.userRepo.update.mockResolvedValue({ affected: 2 });
      expect(await b.svc.bulkUpdateActiveStatus('t', ['a', 'b'], flag, 'adm')).toEqual({ updated: 2 });
      expect(b.sec.log).toHaveBeenCalledTimes(2);
      expect(b.sec.log.mock.calls[0][0].metadata).toEqual({ performedBy: 'adm' });
      expect(b.userRepo.update.mock.calls[0][1]).toEqual({ isActive: flag });
    });
    it('uses different event types for activate vs deactivate', async () => {
      const b = build();
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'adm' ? 900 : 100));
      b.userRepo.find.mockResolvedValue([{ id: 'a', email: 'x' }]);
      b.userRepo.update.mockResolvedValue({ affected: 1 });
      await b.svc.bulkUpdateActiveStatus('t', ['a'], true, 'adm');
      await b.svc.bulkUpdateActiveStatus('t', ['a'], false, 'adm');
      expect(b.sec.log.mock.calls[0][0].eventType).not.toBe(b.sec.log.mock.calls[1][0].eventType);
    });
    it('affected undefined -> 0', async () => {
      const b = build();
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'adm' ? 900 : 100));
      b.userRepo.find.mockResolvedValue([{ id: 'a' }]);
      b.userRepo.update.mockResolvedValue({});
      expect((await b.svc.bulkUpdateActiveStatus('t', ['a'], true, 'adm')).updated).toBe(0);
    });

    it('deactivating a higher-ranked user is rejected', async () => {
      const b = build();
      b.userRepo.find.mockResolvedValue([{ id: 'boss', email: 'b' }]);
      b.userRepo.getMaxRolePriority.mockImplementation(async (id: string) => (id === 'boss' ? 900 : 100));
      b.userRepo.update.mockResolvedValue({ affected: 1 });
      await expect(b.svc.bulkUpdateActiveStatus('t', ['boss'], false, 'low')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
  });

  describe('admin actions', () => {
    it('forcePasswordReset: 404, hierarchy, success', async () => {
      const b = build();
      b.userRepo.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.adminForcePasswordReset('t', 'u')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      b.userRepo.findOne.mockResolvedValue({ id: 'u' });
      b.userRepo.getMaxRolePriority.mockResolvedValue(100);
      await expect(b.svc.adminForcePasswordReset('t', 'u', 'a')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
      const u = { id: 'u', forcePasswordChange: false };
      b.userRepo.findOne.mockResolvedValue(u);
      await b.svc.adminForcePasswordReset('t', 'u');
      expect(u.forcePasswordChange).toBe(true);
      expect(b.userRepo.save).toHaveBeenCalledWith(u);
    });
    it('lock: suspends, far-future lock, revokes sessions', async () => {
      const b = build();
      b.userRepo.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.adminLockUser('t', 'u')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const u: Record<string, unknown> = { id: 'u' };
      b.userRepo.findOne.mockResolvedValue(u);
      await b.svc.adminLockUser('t', 'u');
      expect(u).toMatchObject({ status: 'suspended', lockedUntil: new Date('2099-12-31T23:59:59Z') });
      expect(b.sessions.update).toHaveBeenCalledWith(expect.anything(), { revokedAt: NOW, revokedReason: 'admin_lock' });
      b.userRepo.getMaxRolePriority.mockResolvedValue(100);
      await expect(b.svc.adminLockUser('t', 'u', 'a')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('unlock', async () => {
      const b = build();
      b.userRepo.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.adminUnlockUser('t', 'u')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const u: Record<string, unknown> = { id: 'u', failedLoginAttempts: 9 };
      b.userRepo.findOne.mockResolvedValue(u);
      await b.svc.adminUnlockUser('t', 'u');
      expect(u).toMatchObject({ status: 'active', lockedUntil: null, failedLoginAttempts: 0 });
      b.userRepo.getMaxRolePriority.mockResolvedValue(100);
      await expect(b.svc.adminUnlockUser('t', 'u', 'a')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('getUserOrgs delegates', async () => {
      const b = build();
      b.userRepo.getUserOrgs.mockResolvedValue([1]);
      expect(await b.svc.getUserOrgs('u', 't')).toEqual([1]);
    });
  });

  describe('inviteUser', () => {
    const setup = () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue({ name: 'Acme' });
      b.userRepo.findOne.mockResolvedValue(null);
      b.invites.findOne.mockResolvedValue(null);
      return b;
    };
    it('unknown tenant', async () => {
      const b = setup();
      b.tenants.findOne.mockResolvedValue(null);
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c' })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });
    it('existing user conflict', async () => {
      const b = setup();
      b.userRepo.findOne.mockResolvedValueOnce({ id: 'x' });
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });
    it('active pending invite conflicts; expired or accepted ones do not', async () => {
      const b = setup();
      b.invites.findOne.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() + 1000), acceptedAt: null });
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      b.invites.findOne.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() - 1000), acceptedAt: null });
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c' })).resolves.toBeDefined();
      b.invites.findOne.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() + 1000), acceptedAt: NOW });
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c' })).resolves.toBeDefined();
    });
    it('privilege escalation: unknown roles and roles at/above inviter rank are rejected', async () => {
      const b = setup();
      b.userRepo.getRolePriorities.mockResolvedValueOnce(null);
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c', roleIds: ['x'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      b.userRepo.getRolePriorities.mockResolvedValue([900]);
      b.userRepo.getMaxRolePriority.mockResolvedValue(900);
      await expect(b.svc.inviteUser('t', 'me', { email: 'a@b.c', roleIds: ['x'] })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
      expect(b.invites.save).not.toHaveBeenCalled();
      expect(b.email.sendInviteEmail).not.toHaveBeenCalled();
    });
    it('success: random 128-hex token, default 7d expiry, name fallbacks, custom frontend url', async () => {
      const b = setup();
      b.userRepo.getRolePriorities.mockResolvedValue([10]);
      b.userRepo.getMaxRolePriority.mockResolvedValue(900);
      b.config.get.mockReturnValue('https://app.io');
      b.userRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ firstName: 'A', lastName: 'B', email: 'i@x' });
      const out = await b.svc.inviteUser('t', 'me', { email: 'a@b.c', roleIds: ['r'] });
      expect(out).toEqual({ message: 'Invitation sent' });
      const invite = b.invites.create.mock.calls[0]![0] as { token: string; expiresAt: Date; roleIds: string[] };
      expect(invite.token).toMatch(/^[0-9a-f]{64}$/); // sha256 digest at rest
      expect(invite.expiresAt).toEqual(new Date(NOW.getTime() + 7 * 86_400_000));
      expect(invite.roleIds).toEqual(['r']);
      expect(b.email.sendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ inviterName: 'A B', inviteUrl: expect.stringMatching(/^https:\/\/app\.io\/invite\/[0-9a-f]{128}$/), expiresInDays: 7, tenantName: 'Acme' }));
      const sent = b.email.sendInviteEmail.mock.calls[0]![0] as { inviteUrl: string };
      expect(createHash('sha256').update(sent.inviteUrl.split('/').pop()!).digest('hex')).toBe(invite.token);
    });
    it('inviter name fallbacks: displayName, email, generic; default url', async () => {
      for (const [inviter, expected] of [[{ displayName: 'DN', email: 'e' }, 'DN'], [{ email: 'e@x' }, 'e@x'], [null, 'A workspace admin']] as const) {
        const b = setup();
        b.config.get.mockReturnValue(undefined);
        b.userRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(inviter);
        await b.svc.inviteUser('t', 'me', { email: 'a@b.c', expiresInDays: 1 });
        const arg = b.email.sendInviteEmail.mock.calls[0][0];
        expect(arg.inviterName).toBe(expected);
        expect(arg.inviteUrl.startsWith('http://localhost:3000/invite/')).toBe(true);
        expect((b.invites.create.mock.calls[0]![0] as { roleIds: string[] }).roleIds).toEqual([]);
      }
    });
  });

  describe('exportUsers', () => {
    it('builds quoted CSV with escaped quotes and max limit', async () => {
      const b = build();
      const q = qb(null, [{ id: 'u', email: 'a@b.c', firstName: 'A"B', emailVerified: true, isActive: false, lastLoginAt: NOW, createdAt: NOW, updatedAt: NOW }, { id: 'v', email: 'x', emailVerified: false, isActive: true, createdAt: NOW, updatedAt: NOW }]);
      b.userRepo.createQueryBuilder.mockReturnValue(q);
      await b.svc.exportUsers('t', { limit: 5 });
      expect(q.take).toHaveBeenCalledWith(100);
      const csv = await b.svc.exportUsers('t');
      const lines = csv.split('\n');
      expect(lines[0]).toBe('ID,Email,First Name,Last Name,Display Name,Email Verified,Active,Last Login,Created At');
      expect(lines[1]).toBe(`"u","a@b.c","A""B","","","Yes","No","${NOW.toISOString()}","${NOW.toISOString()}"`);
      expect(lines[2]).toContain('"Never"');
    });

    it('formula-leading values are neutralised', async () => {
      const b = build();
      b.userRepo.createQueryBuilder.mockReturnValue(qb(null, [{ id: 'u', email: 'a@b.c', firstName: '=1+1', emailVerified: true, isActive: true, createdAt: NOW, updatedAt: NOW }]));
      const csv = await b.svc.exportUsers('t');
      expect(csv).not.toContain('"=1+1"');
    });
  });

  describe('invite listing and revocation', () => {
    const actor = { userId: 'me', email: 'me@x.io', ip: '1.1.1.1', requestId: 'rq' };

    it('lists only pending invites for the tenant and never exposes the token', async () => {
      const b = build();
      b.invites.find.mockResolvedValue([{ id: 'i1', email: 'a@b.c', token: 'HASH', roleIds: ['r'], invitedBy: 'u', expiresAt: NOW, createdAt: NOW }]);
      const out = await b.svc.listPendingInvites('t1');
      expect(b.invites.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1' }) }));
      expect(out).toEqual([{ id: 'i1', email: 'a@b.c', roleIds: ['r'], invitedBy: 'u', expiresAt: NOW, createdAt: NOW }]);
      expect(JSON.stringify(out)).not.toContain('HASH');
    });

    it('revokes a pending invite by tenant-scoped id and audits it', async () => {
      const b = build();
      b.invites.findOne.mockResolvedValue({ id: 'i1', email: 'a@b.c', acceptedAt: null });
      await b.svc.revokeInvite('t1', 'i1', actor);
      expect(b.invites.findOne).toHaveBeenCalledWith({ where: { id: 'i1', tenantId: 't1' } });
      expect(b.invites.delete).toHaveBeenCalledWith({ id: 'i1', tenantId: 't1' });
      expect(b.sec.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', userId: 'me', eventType: 'user.invite_revoked', resourceId: 'i1', requestId: 'rq' }));
    });

    it('404s for an unknown or other-tenant invite and 409s for an accepted one', async () => {
      const b = build();
      b.invites.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.revokeInvite('t1', 'x', actor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      b.invites.findOne.mockResolvedValueOnce({ id: 'i1', email: 'a@b.c', acceptedAt: NOW });
      await expect(b.svc.revokeInvite('t1', 'i1', actor)).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      expect(b.invites.delete).not.toHaveBeenCalled();
    });
  });
});

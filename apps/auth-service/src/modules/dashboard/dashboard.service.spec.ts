import { DashboardService } from './dashboard.service';

jest.mock('@/core/database/session.repository', () => ({ SessionRepository: class SessionRepository {} }));
jest.mock('@/common/service/redis.service', () => ({ RedisService: class RedisService {} }));

function build() {
  const users = { count: jest.fn(), createQueryBuilder: jest.fn() };
  const sessions = { count: jest.fn() };
  const clients = { count: jest.fn() };
  const events = { find: jest.fn() };
  const social = { createQueryBuilder: jest.fn() };
  const webauthn = { count: jest.fn() };
  const redis = { getDailyApiCallCounts: jest.fn() };
  const svc = new DashboardService(users as never, sessions as never, clients as never, events as never, social as never, webauthn as never, redis as never);
  return { svc, users, sessions, clients, events, social, webauthn, redis };
}

describe('DashboardService', () => {
  afterEach(() => jest.useRealTimers());

  describe('getTenantMetrics', () => {
    it('computes mfa adoption and scopes every count by tenant', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-03-01T00:00:00Z'));
      const b = build();
      b.users.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
      b.sessions.count.mockResolvedValue(7);
      b.clients.count.mockResolvedValue(2);
      const out = await b.svc.getTenantMetrics('t1');
      expect(out).toEqual({ totalUsers: 4, activeSessions: 7, totalApplications: 2, mfaAdoptionRate: 0.25, activeApiKeys: 0 });
      expect(b.users.count).toHaveBeenNthCalledWith(1, { where: { tenantId: 't1' } });
      expect(b.users.count).toHaveBeenNthCalledWith(2, { where: { tenantId: 't1', mfaEnabled: true } });
      const where = b.sessions.count.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.expiresAt.value).toEqual(new Date('2025-03-01T00:00:00Z'));
      expect(b.clients.count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    });

    it('avoids divide-by-zero with no users', async () => {
      const b = build();
      b.users.count.mockResolvedValue(0);
      b.sessions.count.mockResolvedValue(0);
      b.clients.count.mockResolvedValue(0);
      expect((await b.svc.getTenantMetrics('t')).mfaAdoptionRate).toBe(0);
    });

    it('propagates repository failures', async () => {
      const b = build();
      b.users.count.mockRejectedValue(new Error('db'));
      b.sessions.count.mockResolvedValue(0);
      b.clients.count.mockResolvedValue(0);
      await expect(b.svc.getTenantMetrics('t')).rejects.toThrow('db');
    });
  });

  describe('getTenantActivity', () => {
    const e = { id: 'e', eventType: 'LOGIN', actorEmail: 'a@b.c', ipAddress: '1.1.1.1', location: 'X', createdAt: new Date(0), severity: 'info', resourceType: 'user', resourceId: 'u', tenantId: 'secret', metadata: { x: 1 } };

    it('maps only whitelisted fields, newest first, default limit 20', async () => {
      const b = build();
      b.events.find.mockResolvedValue([e]);
      const out = await b.svc.getTenantActivity('t');
      expect(b.events.find).toHaveBeenCalledWith({ where: { tenantId: 't' }, order: { createdAt: 'DESC' }, take: 20 });
      expect(out).toEqual([{ id: 'e', eventType: 'LOGIN', actorEmail: 'a@b.c', ipAddress: '1.1.1.1', location: 'X', createdAt: new Date(0), severity: 'info', resourceType: 'user', resourceId: 'u' }]);
      expect(out[0]).not.toHaveProperty('metadata');
      expect(out[0]).not.toHaveProperty('tenantId');
    });

    it('honors custom limit and empty results', async () => {
      const b = build();
      b.events.find.mockResolvedValue([]);
      expect(await b.svc.getTenantActivity('t', 5)).toEqual([]);
      expect(b.events.find).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  describe('getApiCallTrend', () => {
    it.each([7, 14, 30] as const)('builds %i consecutive ascending dates ending today and zero-fills', async (days) => {
      jest.useFakeTimers().setSystemTime(new Date('2025-03-10T12:00:00Z'));
      const b = build();
      b.redis.getDailyApiCallCounts.mockResolvedValue([5]);
      const out = await b.svc.getApiCallTrend("t", days);
      expect(out).toHaveLength(days);
      expect(out.at(-1)!.date).toBe('2025-03-10');
      expect(out[0]!.count).toBe(5);
      expect(out[1]!.count).toBe(0);
      const [tenant, dates] = b.redis.getDailyApiCallCounts.mock.calls[0];
      expect(tenant).toBe('t');
      expect([...dates].sort()).toEqual(dates);
    });

    it('defaults to 7 days', async () => {
      const b = build();
      b.redis.getDailyApiCallCounts.mockResolvedValue([]);
      expect(await b.svc.getApiCallTrend('t')).toHaveLength(7);
    });
  });

  describe('getAuthMethodBreakdown', () => {
    function wire(b: ReturnType<typeof build>, rows: { provider: string; count: string }[], emailOnly: number, passkeys: number) {
      const sq: Record<string, jest.Mock> = {};
      for (const m of ['select', 'addSelect', 'where', 'groupBy']) sq[m] = jest.fn().mockReturnValue(sq);
      sq.getRawMany = jest.fn().mockResolvedValue(rows);
      b.social.createQueryBuilder.mockReturnValue(sq);
      const uq = { where: jest.fn(), andWhere: jest.fn(), getCount: jest.fn().mockResolvedValue(emailOnly) };
      uq.where.mockReturnValue(uq);
      uq.andWhere.mockReturnValue(uq);
      b.users.createQueryBuilder.mockReturnValue(uq);
      b.webauthn.count.mockResolvedValue(passkeys);
      return { sq, uq };
    }

    it('maps providers, ignores unknown ones, defaults to zero', async () => {
      const b = build();
      const { sq, uq } = wire(b, [{ provider: 'google', count: '3' }, { provider: 'github', count: '1' }, { provider: 'okta', count: '9' }], 10, 2);
      expect(await b.svc.getAuthMethodBreakdown('t1')).toEqual({ emailPassword: 10, google: 3, github: 1, microsoft: 0, apple: 0, passkey: 2 });
      expect(sq.where).toHaveBeenCalledWith('sc.tenantId = :tenantId', { tenantId: 't1' });
      expect(uq.where).toHaveBeenCalledWith('u.tenantId = :tenantId', { tenantId: 't1' });
      expect(uq.andWhere.mock.calls[0][1]).toEqual({ tenantId: 't1' });
      expect(b.webauthn.count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    });

    it('empty tenant', async () => {
      const b = build();
      wire(b, [], 0, 0);
      expect(await b.svc.getAuthMethodBreakdown('t')).toEqual({ emailPassword: 0, google: 0, github: 0, microsoft: 0, apple: 0, passkey: 0 });
    });
  });
});

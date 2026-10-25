import 'reflect-metadata';
import { DashboardController } from './dashboard.controller';
import { PERMISSIONS_KEY } from '@/modules/rbac/guards/permissions.guard';

jest.mock('@/core/database/session.repository', () => ({ SessionRepository: class SessionRepository {} }));
jest.mock('@/modules/mfa/mfa.service', () => ({ MfaService: class MfaService {} }));
jest.mock('@/common/decorators/protected.decorator', () => ({ Protected: () => () => undefined }));

function build() {
  const users = { findOne: jest.fn() };
  const sessions = { count: jest.fn() };
  const tenants = { findOne: jest.fn(), update: jest.fn() };
  const social = { find: jest.fn(), createQueryBuilder: jest.fn(), findOne: jest.fn(), update: jest.fn(), save: jest.fn() };
  const mfa = { getMfaStatus: jest.fn() };
  const dash = { getTenantMetrics: jest.fn(), getTenantActivity: jest.fn(), getApiCallTrend: jest.fn(), getAuthMethodBreakdown: jest.fn() };
  const events = { log: jest.fn() };
  const crypto = { encryptSecret: jest.fn((v: string) => `enc:v1:${v}`) };
  const c = new DashboardController(users as never, sessions as never, tenants as never, social as never, mfa as never, dash as never, events as never, crypto as never);
  // getTenantSettings reads providers through a query builder (client_secret is select:false).
  social.createQueryBuilder.mockImplementation(() => { const q = { addSelect: () => q, where: () => q, getMany: () => social.find() }; return q; });
  return { c, crypto, users, sessions, tenants, social, mfa, dash, events };
}
const req = { tenantId: 't1', user: { sub: 'u1' } };

describe('DashboardController', () => {
  describe('getOverview', () => {
    it('returns profile projection (no password hash etc.), mfa and sessions', async () => {
      const b = build();
      b.users.findOne.mockResolvedValue({ id: 'u1', email: 'e', firstName: 'f', lastName: 'l', displayName: 'd', avatarUrl: 'a', emailVerified: true, lastLoginAt: new Date(1), createdAt: new Date(0), primaryAuthMethod: 'password', status: 'active', passwordHash: 'SECRET' });
      b.mfa.getMfaStatus.mockResolvedValue({ enabled: true });
      b.sessions.count.mockResolvedValue(2);
      const out = await b.c.getOverview(req);
      expect(out.user).not.toHaveProperty('passwordHash');
      expect(out).toMatchObject({ user: { id: 'u1', email: 'e' }, mfa: { enabled: true }, stats: { activeSessions: 2, lastLoginAt: new Date(1) } });
      expect(b.users.findOne).toHaveBeenCalledWith({ where: { id: 'u1', tenantId: 't1' } });
      expect(b.mfa.getMfaStatus).toHaveBeenCalledWith('u1', 't1');
    });

    it('tolerates a missing user record', async () => {
      const b = build();
      b.users.findOne.mockResolvedValue(null);
      b.sessions.count.mockResolvedValue(0);
      const out = await b.c.getOverview(req);
      expect(out.user.id).toBeUndefined();
    });

    it('counts only non-expired sessions', async () => {
      const b = build();
      b.users.findOne.mockResolvedValue({});
      b.sessions.count.mockResolvedValue(0);
      await b.c.getOverview(req);
      expect(b.sessions.count.mock.calls[0][0].where).toHaveProperty('expiresAt');
    });
  });

  describe('tenant settings', () => {
    it('get: hides secrets, exposes hasClientSecret', async () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue({ featureFlags: { a: true } });
      b.social.find.mockResolvedValue([{ provider: 'google', enabled: true, clientId: 'cid', clientSecret: 'S' }, { provider: 'github', enabled: false }]);
      const out = await b.c.getTenantSettings(req);
      expect(out).toEqual({ featureFlags: { a: true }, socialProviders: [{ provider: 'google', enabled: true, clientId: 'cid', hasClientSecret: true }, { provider: 'github', enabled: false, clientId: null, hasClientSecret: false }] });
      expect(JSON.stringify(out)).not.toContain('"S"');
    });

    it('get: defaults when tenant missing', async () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue(null);
      b.social.find.mockResolvedValue([]);
      expect(await b.c.getTenantSettings(req)).toEqual({ featureFlags: {}, socialProviders: [] });
    });

    it('patch merges flags onto existing and scopes to tenant', async () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue({ featureFlags: { a: true, b: false } });
      expect(await b.c.updateTenantSettings(req, { featureFlags: { b: true } } as never)).toEqual({ message: 'Settings updated' });
      expect(b.tenants.update).toHaveBeenCalledWith({ id: 't1' }, { featureFlags: { a: true, b: true } });
      expect(b.events.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', userId: 'u1', metadata: { flags: ['b'] } }));
    });

    it('patch with tenant lacking flags', async () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue({});
      await b.c.updateTenantSettings(req, { featureFlags: { x: true } } as never);
      expect(b.tenants.update).toHaveBeenCalledWith({ id: 't1' }, { featureFlags: { x: true } });
    });

    it('patch on unknown tenant yields RESOURCE_NOT_FOUND', async () => {
      const b = build();
      b.tenants.findOne.mockResolvedValue(null);
      await expect(b.c.updateTenantSettings(req, { featureFlags: {} } as never)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('metrics endpoints', () => {
    it('delegate with tenant', async () => {
      const b = build();
      await b.c.getTenantMetrics(req);
      expect(b.dash.getTenantMetrics).toHaveBeenCalledWith('t1');
      await b.c.getAuthBreakdown(req);
      expect(b.dash.getAuthMethodBreakdown).toHaveBeenCalledWith('t1');
    });

    it.each([
      [undefined, 20], ['5', 5], ['500', 100], ['abc', 20], ['0', 20], ['-3', -3],
    ])('activity limit %s -> %s', async (input, expected) => {
      const b = build();
      await b.c.getTenantActivity(req, input);
      expect(b.dash.getTenantActivity).toHaveBeenCalledWith('t1', expected);
    });

    it.each([
      [undefined, 7], ['7', 7], ['14', 14], ['30', 30], ['15', 7], ['abc', 7], ['-1', 7],
    ])('trend days %s -> %s', async (input, expected) => {
      const b = build();
      await b.c.getApiCallTrend(req, input);
      expect(b.dash.getApiCallTrend).toHaveBeenCalledWith('t1', expected);
    });
  });

  describe('updateSocialProvider', () => {
    it('updates existing, only touching provided fields', async () => {
      const b = build();
      b.social.findOne.mockResolvedValue({ id: 'sp1' });
      await b.c.updateSocialProvider(req, 'google', { enabled: true } as never);
      expect(b.social.findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', provider: 'google' } });
      expect(b.social.update).toHaveBeenCalledWith('sp1', { enabled: true });
      await b.c.updateSocialProvider(req, 'google', { enabled: false, clientId: 'c', clientSecret: 's' } as never);
      expect(b.social.update).toHaveBeenLastCalledWith('sp1', { enabled: false, clientId: 'c', clientSecret: 'enc:v1:s' });
      expect(b.social.save).not.toHaveBeenCalled();
    });

    it('creates when missing, shared app when no clientId', async () => {
      const b = build();
      b.social.findOne.mockResolvedValue(null);
      expect(await b.c.updateSocialProvider(req, 'github', { enabled: true } as never)).toEqual({ message: 'Social provider updated' });
      expect(b.social.save).toHaveBeenCalledWith({ tenantId: 't1', provider: 'github', enabled: true, clientId: undefined, clientSecret: undefined, useSharedApp: true });
      await b.c.updateSocialProvider(req, 'github', { enabled: true, clientId: 'c', clientSecret: 's' } as never);
      expect(b.social.save).toHaveBeenLastCalledWith(expect.objectContaining({ useSharedApp: false }));
    });

    it('rejects unknown provider names', async () => {
      const b = build();
      b.social.findOne.mockResolvedValue(null);
      await expect(b.c.updateSocialProvider(req, 'evil-provider', { enabled: true } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(b.social.save).not.toHaveBeenCalled();
      expect(b.events.log).not.toHaveBeenCalled();
    });
  });

  it('write endpoints require TENANT_WRITE', () => {
    const p = DashboardController.prototype as unknown as Record<string, () => void>;
    for (const m of ['updateTenantSettings', 'updateSocialProvider']) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, p[m]!)).toEqual(['tenant:write']);
    }
  });
});

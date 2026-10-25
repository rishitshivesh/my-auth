import { ApiException } from '@/common/http';
import { OAuthConsentService } from './oauth-consent.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY = 86_400_000;

function qb(result: unknown) {
  const b: Record<string, jest.Mock> = {};
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'update', 'set']) b[m] = jest.fn(() => b);
  b.getMany = jest.fn().mockResolvedValue(result);
  b.execute = jest.fn().mockResolvedValue(result);
  return b;
}

function setup() {
  const consents = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (v: unknown) => v),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const clients = { findOne: jest.fn() };
  const users = { findOne: jest.fn() };
  const svc = new OAuthConsentService(consents as never, clients as never, users as never);
  return { svc, consents, clients, users };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiException);
  return (e as ApiException).code;
};

describe('OAuthConsentService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('getConsent / hasConsent', () => {
    it('queries only non-revoked consent for the exact tenant/user/client', async () => {
      const { svc, consents } = setup();
      consents.findOne.mockResolvedValue(null);
      await expect(svc.getConsent('t', 'u', 'c')).resolves.toBeNull();
      const where = consents.findOne.mock.calls[0]?.[0].where;
      expect(where).toMatchObject({ tenantId: 't', userId: 'u', clientId: 'c' });
      expect(where.revokedAt).toBeDefined();
    });
    it('treats expired consent as absent', async () => {
      const { svc, consents } = setup();
      consents.findOne.mockResolvedValue({ isExpired: true });
      await expect(svc.getConsent('t', 'u', 'c')).resolves.toBeNull();
    });
    it('hasConsent: false when none, delegates to hasAllScopes otherwise', async () => {
      const { svc, consents } = setup();
      consents.findOne.mockResolvedValueOnce(null);
      await expect(svc.hasConsent('t', 'u', 'c', ['a'])).resolves.toBe(false);
      const hasAllScopes = jest.fn().mockReturnValue(false);
      consents.findOne.mockResolvedValueOnce({ isExpired: false, hasAllScopes });
      await expect(svc.hasConsent('t', 'u', 'c', ['a', 'b'])).resolves.toBe(false);
      expect(hasAllScopes).toHaveBeenCalledWith(['a', 'b']);
      consents.findOne.mockResolvedValueOnce({ isExpired: false, hasAllScopes: () => true });
      await expect(svc.hasConsent('t', 'u', 'c', ['a'])).resolves.toBe(true);
    });
  });

  describe('grantConsent', () => {
    const dto = { tenantId: 't', clientId: 'c', userId: 'u', grantedScopes: ['openid'] };

    it('404s for unknown client then unknown user', async () => {
      const { svc, clients, users } = setup();
      clients.findOne.mockResolvedValue(null);
      expect(await codeOf(svc.grantConsent(dto))).toBe('RESOURCE_NOT_FOUND');
      clients.findOne.mockResolvedValue({ clientId: 'cid' });
      users.findOne.mockResolvedValue(null);
      expect(await codeOf(svc.grantConsent(dto))).toBe('RESOURCE_NOT_FOUND');
    });

    const ready = () => {
      const s = setup();
      s.clients.findOne.mockResolvedValue({ clientId: 'cid' });
      s.users.findOne.mockResolvedValue({ id: 'u' });
      return s;
    };

    it('creates new consent with expiry from expiresInDays', async () => {
      const { svc, consents } = ready();
      consents.findOne.mockResolvedValue(null);
      await svc.grantConsent({ ...dto, expiresInDays: 2, ipAddress: 'ip', userAgent: 'ua' });
      expect(consents.save.mock.calls[0]?.[0]).toMatchObject({
        tenantId: 't',
        rememberConsent: false,
        expiresAt: new Date(NOW.getTime() + 2 * DAY),
        ipAddress: 'ip',
        userAgent: 'ua',
      });
    });

    it('remember=true means permanent (no expiry) even with expiresInDays', async () => {
      const { svc, consents } = ready();
      consents.findOne.mockResolvedValue(null);
      await svc.grantConsent({ ...dto, rememberConsent: true, expiresInDays: 5 });
      const saved = consents.save.mock.calls[0]?.[0] as { expiresAt?: Date; rememberConsent?: boolean };
      expect(saved?.expiresAt).toBeUndefined();
      expect(saved?.rememberConsent).toBe(true);
    });

    it('no expiresInDays (or 0) yields no expiry', async () => {
      const { svc, consents } = ready();
      consents.findOne.mockResolvedValue(null);
      await svc.grantConsent({ ...dto, expiresInDays: 0 });
      expect((consents.save.mock.calls[0]?.[0] as { expiresAt?: Date }).expiresAt).toBeUndefined();
    });

    it('updates and un-revokes an existing consent', async () => {
      const { svc, consents } = ready();
      const existing = { revokedAt: NOW, revokedReason: 'x', grantedScopes: ['old'], rememberConsent: true };
      consents.findOne.mockResolvedValue(existing);
      const out = await svc.grantConsent({ ...dto, expiresInDays: 1 });
      expect(out).toBe(existing);
      expect(existing).toMatchObject({
        grantedScopes: ['openid'],
        rememberConsent: false,
        revokedAt: undefined,
        revokedReason: undefined,
        expiresAt: new Date(NOW.getTime() + DAY),
      });
      expect(consents.save).toHaveBeenCalledWith(existing);
    });
  });

  describe('revoke', () => {
    it('revokeConsent is a no-op when missing', async () => {
      const { svc, consents } = setup();
      consents.findOne.mockResolvedValue(null);
      await svc.revokeConsent('t', 'u', 'c');
      expect(consents.save).not.toHaveBeenCalled();
    });
    it('revokeConsent stamps revokedAt and reason', async () => {
      const { svc, consents } = setup();
      const row: Record<string, unknown> = {};
      consents.findOne.mockResolvedValue(row);
      await svc.revokeConsent('t', 'u', 'c');
      expect(row).toEqual({ revokedAt: NOW, revokedReason: 'user_revoked' });
      await svc.revokeConsent('t', 'u', 'c', 'admin');
      expect(row.revokedReason).toBe('admin');
    });
    it('revokeAllUserConsents / revokeAllClientConsents are tenant-scoped bulk updates', async () => {
      const { svc, consents } = setup();
      await svc.revokeAllUserConsents('t', 'u');
      expect(consents.update.mock.calls[0]?.[0]).toMatchObject({ tenantId: 't', userId: 'u' });
      expect(consents.update.mock.calls[0]?.[1]).toEqual({ revokedAt: NOW, revokedReason: 'user_revoked_all' });
      await svc.revokeAllClientConsents('t', 'c', 'custom');
      expect(consents.update.mock.calls[1]?.[0]).toMatchObject({ tenantId: 't', clientId: 'c' });
      expect(consents.update.mock.calls[1]?.[1].revokedReason).toBe('custom');
      await svc.revokeAllClientConsents('t', 'c');
      expect(consents.update.mock.calls[2]?.[1].revokedReason).toBe('client_deactivated');
    });
  });

  describe('listing', () => {
    it.each([
      ['listUserConsents', 'consent.userId = :userId'],
      ['listClientConsents', 'consent.clientId = :clientId'],
    ] as const)('%s hides revoked by default and includes them on request', async (method, cond) => {
      const { svc, consents } = setup();
      const b1 = qb([1]);
      consents.createQueryBuilder.mockReturnValueOnce(b1);
      await expect(svc[method]('t', 'x')).resolves.toEqual([1]);
      expect(b1.andWhere).toHaveBeenCalledWith(cond, expect.anything());
      expect(b1.andWhere).toHaveBeenCalledWith('consent.revokedAt IS NULL');
      const b2 = qb([]);
      consents.createQueryBuilder.mockReturnValueOnce(b2);
      await svc[method]('t', 'x', true);
      expect(b2.andWhere).not.toHaveBeenCalledWith('consent.revokedAt IS NULL');
      expect(b2.orderBy).toHaveBeenCalledWith('consent.createdAt', 'DESC');
    });
  });

  it('getClientConsentStats classifies revoked before expired before active', async () => {
    const { svc, consents } = setup();
    consents.find.mockResolvedValue([
      { revokedAt: NOW, isExpired: true },
      { revokedAt: null, isExpired: true },
      { revokedAt: null, isExpired: false },
      { revokedAt: null, isExpired: false },
    ]);
    await expect(svc.getClientConsentStats('t', 'c')).resolves.toEqual({ total: 4, active: 2, revoked: 1, expired: 1 });
  });

  describe('cleanupExpiredConsents', () => {
    it('returns affected count', async () => {
      const { svc, consents } = setup();
      const b = qb({ affected: 3 });
      consents.createQueryBuilder.mockReturnValue(b);
      await expect(svc.cleanupExpiredConsents()).resolves.toBe(3);
      expect(b.set).toHaveBeenCalledWith({ revokedAt: NOW, revokedReason: 'expired' });
    });
    it('returns 0 when nothing affected', async () => {
      const { svc, consents } = setup();
      consents.createQueryBuilder.mockReturnValue(qb({}));
      await expect(svc.cleanupExpiredConsents()).resolves.toBe(0);
    });
  });

  describe('isConsentRequired', () => {
    const { svc } = setup();
    it.each([
      ['first party', { isFirstParty: true, requireConsent: true }, undefined, false],
      ['client does not require', { isFirstParty: false, requireConsent: false }, undefined, false],
      ['valid existing consent', { requireConsent: true }, { isValid: true }, false],
      ['invalid existing consent', { requireConsent: true }, { isValid: false }, true],
      ['no consent', { requireConsent: true }, undefined, true],
    ])('%s -> %s', async (_n, client, existing, expected) => {
      await expect(svc.isConsentRequired(client as never, existing as never)).resolves.toBe(expected);
    });
  });
});

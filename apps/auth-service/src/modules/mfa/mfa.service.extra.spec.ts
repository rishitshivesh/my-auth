import * as speakeasy from 'speakeasy';
import * as crypto from 'crypto';
import { PasswordService } from '@repo/security';
import { MfaService } from './mfa.service';
import { MfaGuardService } from './mfa-guard.service';
import { createFakeRedis } from './fake-redis';
import { DomainEventName } from '@/common/service/domain-events.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (u: string) => `data:image/png;base64,${Buffer.from(u).toString('base64')}`) }));

const NOW = new Date('2026-03-01T12:00:00.000Z');
const DAY = 86_400_000;
const T = 't1';
const U = 'u1';

function qb(row: unknown) {
  const b = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(row),
  };
  return b;
}

function setup(row: Record<string, unknown> | null = null, user: Record<string, unknown> | null = { id: U, email: 'a@b.c', firstName: 'Ada' }, tenant: Record<string, unknown> | null = null) {
  const mfaRepo = {
    createQueryBuilder: jest.fn(() => qb(row)),
    findOne: jest.fn().mockResolvedValue(row),
    create: jest.fn((e: Record<string, unknown>) => ({ ...e })),
    save: jest.fn(async (e: unknown) => e),
  };
  const userRepo = { findOne: jest.fn().mockResolvedValue(user), update: jest.fn() };
  const tenantRepo = { findOne: jest.fn().mockResolvedValue(tenant) };
  const events = { log: jest.fn() };
  const domain = { publish: jest.fn() };
  const svc = new MfaService(mfaRepo as never, userRepo as never, tenantRepo as never, events as never, new MfaGuardService(createFakeRedis()), domain as never);
  return { svc, mfaRepo, userRepo, tenantRepo, events, domain };
}

const codeAt = (secret: string, unixSec: number) => speakeasy.totp({ secret, encoding: 'base32', time: unixSec });

describe('MfaService (extra)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('setupTotp', () => {
    it('404s for unknown user', async () => {
      const { svc } = setup(null, null);
      await expect(svc.setupTotp(U, T)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
    it('refuses to replace the secret of an already-enrolled factor', async () => {
      const { svc, mfaRepo } = setup({ totpEnabled: true });
      await expect(svc.setupTotp(U, T)).rejects.toMatchObject({ code: 'MFA_ALREADY_ENABLED' });
      expect(mfaRepo.save).not.toHaveBeenCalled();
    });
    it('creates settings, stores unverified secret, returns QR + 10 formatted backup codes', async () => {
      const { svc, mfaRepo } = setup(null);
      const out = await svc.setupTotp(U, T);
      expect(mfaRepo.create).toHaveBeenCalledWith({ userId: U, tenantId: T });
      const saved = mfaRepo.save.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(saved.totpSecret).toBe(out.secret);
      expect(saved.totpEnabled).toBeUndefined();
      expect(out.qrCode).toMatch(/^data:image\/png/);
      expect(out.backupCodes).toHaveLength(10);
      out.backupCodes.forEach((c) => expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/));
      expect(new Set(out.backupCodes).size).toBe(10);
      expect(out.secret).toMatch(/^[A-Z2-7]+=*$/);
    });
    it('reuses existing not-yet-enabled settings row', async () => {
      const row: Record<string, unknown> = { totpEnabled: false, totpSecret: 'OLD' };
      const { svc, mfaRepo } = setup(row);
      const out = await svc.setupTotp(U, T);
      expect(mfaRepo.create).not.toHaveBeenCalled();
      expect(row.totpSecret).toBe(out.secret);
    });
    it('persists the backup codes it hands to the user during setup, hashed', async () => {
      const { svc, mfaRepo } = setup(null);
      const out = await svc.setupTotp(U, T);
      const saved = mfaRepo.save.mock.calls[0]?.[0] as { backupCodes?: string[] };
      expect(saved.backupCodes).toHaveLength(out.backupCodes.length);
      out.backupCodes.forEach((c) => expect(saved.backupCodes).not.toContain(c));
    });
  });

  describe('TOTP window and replay', () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const nowSec = Math.floor(NOW.getTime() / 1000);

    it.each([
      ['previous step', -30, true],
      ['current step', 0, true],
      ['next step', 30, true],
      ['two steps old', -60, false],
      ['two steps ahead', 60, false],
    ])('verifyTotp: %s -> %s', async (_n, offset, ok) => {
      const { svc } = setup({ totpSecret: secret, totpEnabled: true });
      await expect(svc.verifyTotp(U, T, codeAt(secret, nowSec + offset))).resolves.toBe(ok);
    });

    it('rejects malformed tokens without consuming steps', async () => {
      const { svc } = setup({ totpSecret: secret, totpEnabled: true });
      for (const bad of ['', 'abcdef', '12345', '1234567', ' 123456']) {
        await expect(svc.verifyTotp(U, T, bad)).resolves.toBe(false);
      }
      await expect(svc.verifyTotp(U, T, codeAt(secret, nowSec))).resolves.toBe(true);
    });

    it('a code used for login cannot be replayed from the adjacent time window', async () => {
      const { svc } = setup({ totpSecret: secret, totpEnabled: true });
      const code = codeAt(secret, nowSec);
      await expect(svc.verifyTotp(U, T, code)).resolves.toBe(true);
      jest.setSystemTime(new Date(NOW.getTime() + 30_000));
      await expect(svc.verifyTotp(U, T, code)).resolves.toBe(false);
    });

    it('replay on a challenge counts as a wrong attempt', async () => {
      const { svc } = setup({ totpSecret: secret, totpEnabled: true });
      const code = codeAt(secret, nowSec);
      await svc.verifyTotp(U, T, code, 'ch');
      await expect(svc.verifyTotp(U, T, code, 'ch')).rejects.toMatchObject({ code: 'AUTH_MFA_INVALID' });
    });

    it('verifyAndEnableTotp: replayed enrollment code is rejected', async () => {
      const row = { totpSecret: secret, totpEnabled: false };
      const { svc } = setup(row);
      const code = codeAt(secret, nowSec);
      const ok = await svc.verifyAndEnableTotp(U, T, code);
      expect(ok.backupCodes).toHaveLength(10);
      expect(row).toMatchObject({ totpEnabled: true, totpVerifiedAt: NOW });
      row.totpEnabled = false;
      await expect(svc.verifyAndEnableTotp(U, T, code)).rejects.toMatchObject({ code: 'AUTH_MFA_INVALID' });
    });

    it('notification failures never break enabling (user lookup rejects)', async () => {
      const row = { totpSecret: secret, totpEnabled: false };
      const { svc, userRepo, domain } = setup(row);
      userRepo.findOne.mockRejectedValue(new Error('db'));
      await expect(svc.verifyAndEnableTotp(U, T, codeAt(secret, nowSec))).resolves.toBeDefined();
      expect(domain.publish).toHaveBeenCalledWith(DomainEventName.MFA_ENABLED, expect.objectContaining({ email: undefined }));
    });
  });

  describe('disableTotp / disableAllMfa', () => {
    it('disableTotp clears the secret', async () => {
      const row: Record<string, unknown> = { totpEnabled: true, totpSecret: 's', totpVerifiedAt: NOW };
      const { svc } = setup(row);
      await svc.disableTotp(U, T);
      expect(row).toMatchObject({ totpEnabled: false, totpSecret: undefined, totpVerifiedAt: undefined });
    });
    it('disableAllMfa no-ops without settings', async () => {
      const { svc, events } = setup(null);
      await svc.disableAllMfa(U, T);
      expect(events.log).not.toHaveBeenCalled();
    });
    it('disableAllMfa wipes every factor and recovery code, audits and notifies', async () => {
      const row: Record<string, unknown> = { totpEnabled: true, totpSecret: 's', smsEnabled: true, emailEnabled: true, webauthnEnabled: true, backupCodes: ['x'] };
      const { svc, events, domain } = setup(row);
      await svc.disableAllMfa(U, T, { ipAddress: '1.1.1.1', userAgent: 'ua', requestId: 'r' });
      expect(row).toMatchObject({ totpEnabled: false, smsEnabled: false, emailEnabled: false, webauthnEnabled: false, backupCodes: [], totpSecret: undefined });
      expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', metadata: { scope: 'all_methods' }, ipAddress: '1.1.1.1' }));
      expect(domain.publish).toHaveBeenCalledWith(DomainEventName.MFA_DISABLED, expect.objectContaining({ ip: '1.1.1.1', requestId: 'r' }));
    });
  });

  describe('backup codes', () => {
    it('accepts a legacy sha256-stored code', async () => {
      const sha = crypto.createHash('sha256').update('AAAA-2222').digest('hex');
      const row = { backupCodes: [sha] };
      const { svc } = setup(row);
      await expect(svc.verifyBackupCode(U, T, 'AAAA-2222')).resolves.toBe(true);
      expect(row.backupCodes).toEqual([]);
    });
    it('throws MFA_NOT_ENABLED when no settings / no codes column', async () => {
      await expect(setup(null).svc.verifyBackupCode(U, T, 'x')).rejects.toMatchObject({ code: 'MFA_NOT_ENABLED' });
      await expect(setup({}).svc.verifyBackupCode(U, T, 'x')).rejects.toMatchObject({ code: 'MFA_NOT_ENABLED' });
    });
    it('rejects an empty list, empty entries, wrong code; does not mutate or save', async () => {
      const row = { backupCodes: ['', await PasswordService.hash('RIGHT-2345')] };
      const { svc, mfaRepo } = setup(row);
      await expect(svc.verifyBackupCode(U, T, 'WRONG-2345')).resolves.toBe(false);
      await expect(svc.verifyBackupCode(U, T, '')).resolves.toBe(false);
      expect(row.backupCodes).toHaveLength(2);
      expect(mfaRepo.save).not.toHaveBeenCalled();
      await expect(setup({ backupCodes: [] }).svc.verifyBackupCode(U, T, 'x')).resolves.toBe(false);
    });
    it('is case sensitive (lowercase variant of a valid code is rejected)', async () => {
      const row = { backupCodes: [await PasswordService.hash('ABCD-2345')] };
      await expect(setup(row).svc.verifyBackupCode(U, T, 'abcd-2345')).resolves.toBe(false);
    });
    it('regenerateBackupCodes requires an enabled TOTP factor and stores hashes only', async () => {
      await expect(setup(null).svc.regenerateBackupCodes(U, T)).rejects.toMatchObject({ code: 'MFA_NOT_ENABLED' });
      await expect(setup({ totpEnabled: false }).svc.regenerateBackupCodes(U, T)).rejects.toMatchObject({ code: 'MFA_NOT_ENABLED' });
      const row: Record<string, unknown> = { totpEnabled: true, backupCodes: ['old'] };
      const { svc } = setup(row);
      const codes = await svc.regenerateBackupCodes(U, T);
      expect(codes).toHaveLength(10);
      expect(row.backupCodes).toHaveLength(10);
      expect(row.backupCodes).not.toContain('old');
      for (const c of codes) expect(row.backupCodes).not.toContain(c);
    });
  });

  describe('isMfaEnabled / hasActiveFactor', () => {
    it.each([
      [null, false],
      [{ totpEnabled: false, smsEnabled: false, emailEnabled: false, webauthnEnabled: false }, false],
      [{ totpEnabled: true }, true],
      [{ smsEnabled: true }, true],
      [{ emailEnabled: true }, true],
      [{ webauthnEnabled: true }, true],
    ])('%j -> %s', async (row, expected) => {
      const { svc } = setup(row as never);
      await expect(svc.isMfaEnabled(U, T)).resolves.toBe(expected);
      await expect(svc.hasActiveFactor(U, T)).resolves.toBe(expected);
    });
  });

  describe('getMfaStatus grace period', () => {
    it('starts the grace timer on first call when not enrolled (default 7 days)', async () => {
      const { svc, userRepo } = setup(null, { id: U, mfaGraceStartedAt: null });
      const s = await svc.getMfaStatus(U, T);
      expect(userRepo.update).toHaveBeenCalledWith({ id: U, tenantId: T }, { mfaGraceStartedAt: NOW });
      expect(s).toMatchObject({ enabled: false, methods: [], backupCodesRemaining: 0, preferredMethod: undefined });
      expect(s.grace).toEqual({ startedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString(), daysRemaining: 7, isExpired: false });
    });
    it('counts down and expires; never negative', async () => {
      const start = new Date(NOW.getTime() - 3 * DAY - 1000);
      const a = await setup(null, { id: U, mfaGraceStartedAt: start }).svc.getMfaStatus(U, T);
      expect(a.grace.daysRemaining).toBe(4);
      const b = await setup(null, { id: U, mfaGraceStartedAt: new Date(NOW.getTime() - 7 * DAY) }).svc.getMfaStatus(U, T);
      expect(b.grace).toMatchObject({ daysRemaining: 0, isExpired: true });
      const c = await setup(null, { id: U, mfaGraceStartedAt: new Date(NOW.getTime() - 30 * DAY) }).svc.getMfaStatus(U, T);
      expect(c.grace.daysRemaining).toBe(0);
    });
    it.each([
      [{ mfa_grace_1d: true }, 1],
      [{ mfa_grace_3d: true }, 3],
      [{ mfa_grace_5d: true }, 5],
      [{ mfa_grace_14d: true }, 14],
      [{ mfa_grace_7d: true }, 7],
      [{ unrelated: true }, 7],
    ])('tenant flags %j -> %i day grace', async (flags, days) => {
      const { svc } = setup(null, { id: U, mfaGraceStartedAt: new Date(NOW.getTime()) }, { id: T, featureFlags: flags });
      const s = await svc.getMfaStatus(U, T);
      expect(s.grace.daysRemaining).toBe(days);
    });
    it('clears the timer and reports methods once enrolled', async () => {
      const row = { totpEnabled: true, webauthnEnabled: true, backupCodes: ['a', 'b'], preferredMethod: 'webauthn' };
      const { svc, userRepo } = setup(row, { id: U, mfaGraceStartedAt: NOW });
      const s = await svc.getMfaStatus(U, T);
      expect(userRepo.update).toHaveBeenCalledWith({ id: U, tenantId: T }, { mfaGraceStartedAt: null });
      expect(s).toMatchObject({ enabled: true, methods: ['totp', 'webauthn'], preferredMethod: 'webauthn', backupCodesRemaining: 2 });
      expect(s.grace).toMatchObject({ startedAt: NOW.toISOString(), expiresAt: null, isExpired: false });
    });
    it('enrolled with no timer does not write; preferredMethod defaults to first; no user is tolerated', async () => {
      const a = setup({ smsEnabled: true, emailEnabled: true }, { id: U, mfaGraceStartedAt: null });
      const s = await a.svc.getMfaStatus(U, T);
      expect(a.userRepo.update).not.toHaveBeenCalled();
      expect(s.preferredMethod).toBe('sms');
      const b = setup(null, null);
      const s2 = await b.svc.getMfaStatus(U, T);
      expect(b.userRepo.update).not.toHaveBeenCalled();
      expect(s2.grace.startedAt).toBeNull();
    });
  });
});

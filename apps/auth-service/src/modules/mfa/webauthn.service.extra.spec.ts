import { ApiException } from '@/common/http';
import { DomainEventName } from '@/common/service/domain-events.service';
import { WebAuthnService, MAX_PASSKEYS_PER_USER } from './webauthn.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));
import * as swa from '@simplewebauthn/server';

const T = 't1';
const U = 'u1';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function setup(cfg: Record<string, string> = {}) {
  const mfaRepo = { findOne: jest.fn(), create: jest.fn((e: object) => ({ ...e })), save: jest.fn(), update: jest.fn() };
  const userRepo = { findOne: jest.fn().mockResolvedValue({ id: U, email: 'a@b.c', firstName: 'A', lastName: 'B' }) };
  const credRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((e: object) => ({ ...e })),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => qb),
  };
  const qb = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({ affected: 1 }) };
  const ds = { createQueryBuilder: jest.fn(() => qb) };
  const redis = { set: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const events = { log: jest.fn() };
  const domain = { publish: jest.fn() };
  const config = { get: jest.fn((k: string) => cfg[k]) };
  const svc = new WebAuthnService(mfaRepo as never, userRepo as never, credRepo as never, config as never, redis as never, ds as never, events as never, domain as never);
  return { svc, mfaRepo, userRepo, credRepo, qb, redis, events, domain };
}

const credRow = (o: object = {}) => ({ id: 'row1', userId: U, tenantId: T, credentialId: 'cid', publicKey: Buffer.from('pk'), counter: 5, transports: ['internal'], ...o });
const apiCode = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiException);
  return (e as ApiException).code;
};

describe('WebAuthnService (extra)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('startRegistration', () => {
    beforeEach(() => (swa.generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'CH' }));

    it('404s for unknown user', async () => {
      const { svc, userRepo } = setup();
      userRepo.findOne.mockResolvedValue(null);
      expect(await apiCode(svc.startRegistration(U, T))).toBe('RESOURCE_NOT_FOUND');
    });
    it('enforces passkey cap at exactly MAX and allows MAX-1', async () => {
      const a = setup();
      a.credRepo.count.mockResolvedValue(MAX_PASSKEYS_PER_USER);
      expect(await apiCode(a.svc.startRegistration(U, T))).toBe('PASSKEY_LIMIT');
      const b = setup();
      b.credRepo.count.mockResolvedValue(MAX_PASSKEYS_PER_USER - 1);
      b.mfaRepo.findOne.mockResolvedValue({});
      await expect(b.svc.startRegistration(U, T)).resolves.toEqual({ challenge: 'CH' });
    });
    it('creates the mfa settings row when missing, excludes existing creds, stores challenge with 5min TTL', async () => {
      const { svc, mfaRepo, credRepo, redis } = setup({ WEBAUTHN_RP_ID: 'ex.com', WEBAUTHN_ORIGIN: 'https://ex.com', WEBAUTHN_RP_NAME: 'Ex' });
      mfaRepo.findOne.mockResolvedValue(null);
      credRepo.find.mockResolvedValue([{ credentialId: 'old' }]);
      await svc.startRegistration(U, T);
      expect(mfaRepo.save).toHaveBeenCalled();
      const opts = (swa.generateRegistrationOptions as jest.Mock).mock.calls[0][0];
      expect(opts).toMatchObject({ rpName: 'Ex', rpID: 'ex.com', userName: 'a@b.c', excludeCredentials: [{ id: 'old', type: 'public-key' }], attestationType: 'none' });
      expect(redis.set).toHaveBeenCalledWith(T, 'passkey:challenge:reg', U, 'CH', 300);
    });
    it('does not recreate existing mfa settings', async () => {
      const { svc, mfaRepo } = setup();
      mfaRepo.findOne.mockResolvedValue({});
      await svc.startRegistration(U, T);
      expect(mfaRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('finishRegistration', () => {
    const resp = { response: { transports: ['usb'] } } as never;
    const ok = { verified: true, registrationInfo: { credential: { id: 'newcid', publicKey: new Uint8Array([1, 2]), counter: 0 } } };

    it('rejects when no challenge (expired / never started)', async () => {
      const { svc, redis } = setup();
      redis.get.mockResolvedValue(null);
      expect(await apiCode(svc.finishRegistration(U, T, resp))).toBe('PASSKEY_INVALID');
      expect(swa.verifyRegistrationResponse).not.toHaveBeenCalled();
      expect(redis.delete).toHaveBeenCalled();
    });
    it('maps verifier exceptions to PASSKEY_INVALID (wrong origin / challenge)', async () => {
      const { svc, redis } = setup();
      redis.get.mockResolvedValue('CH');
      (swa.verifyRegistrationResponse as jest.Mock).mockRejectedValue(new Error('origin mismatch'));
      expect(await apiCode(svc.finishRegistration(U, T, resp))).toBe('PASSKEY_INVALID');
    });
    it.each([[{ verified: false }], [{ verified: true }]])('rejects unverified result %j', async (v) => {
      const { svc, redis } = setup();
      redis.get.mockResolvedValue('CH');
      (swa.verifyRegistrationResponse as jest.Mock).mockResolvedValue(v);
      expect(await apiCode(svc.finishRegistration(U, T, resp))).toBe('PASSKEY_INVALID');
    });
    it('verifies against configured origin/rpID, saves credential, enables flag, audits', async () => {
      const { svc, redis, credRepo, mfaRepo, events } = setup({ WEBAUTHN_RP_ID: 'ex.com', WEBAUTHN_ORIGIN: 'https://ex.com' });
      redis.get.mockResolvedValue('CH');
      (swa.verifyRegistrationResponse as jest.Mock).mockResolvedValue(ok);
      await expect(svc.finishRegistration(U, T, resp, 'Phone')).resolves.toEqual({ credentialId: 'newcid' });
      expect(swa.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({ expectedChallenge: 'CH', expectedOrigin: 'https://ex.com', expectedRPID: 'ex.com' }));
      expect(credRepo.create).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'newcid', counter: 0, deviceName: 'Phone', transports: ['usb'], lastUsedAt: NOW }));
      expect(mfaRepo.update).toHaveBeenCalledWith({ userId: U, tenantId: T }, { webauthnEnabled: true });
      expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'passkey.registered', resourceId: 'newcid' }));
    });
    it('defaults device name and transports', async () => {
      const { svc, redis, credRepo } = setup();
      redis.get.mockResolvedValue('CH');
      (swa.verifyRegistrationResponse as jest.Mock).mockResolvedValue(ok);
      await svc.finishRegistration(U, T, { response: {} } as never);
      expect(credRepo.create).toHaveBeenCalledWith(expect.objectContaining({ deviceName: 'Unnamed Device', transports: [] }));
    });
  });

  describe('startAuthentication', () => {
    it('refuses when the user has no passkeys', async () => {
      const { svc } = setup();
      expect(await apiCode(svc.startAuthentication(U, T))).toBe('MFA_NOT_ENABLED');
    });
    it('returns options + random unguessable nonce; challenge stored by nonce (not userId)', async () => {
      const { svc, credRepo, redis } = setup();
      credRepo.find.mockResolvedValue([credRow()]);
      (swa.generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'AC' });
      const a = await svc.startAuthentication(U, T);
      const b = await svc.startAuthentication(U, T);
      expect(a.sessionNonce).toMatch(/^[0-9a-f]{32}$/);
      expect(a.sessionNonce).not.toBe(b.sessionNonce);
      expect(redis.set).toHaveBeenCalledWith(T, 'passkey:challenge:auth', a.sessionNonce, 'AC', 300);
      expect((swa.generateAuthenticationOptions as jest.Mock).mock.calls[0][0].allowCredentials).toEqual([{ id: 'cid', type: 'public-key', transports: ['internal'] }]);
    });
  });

  describe('finishAuthentication', () => {
    const resp = { id: 'cid', rawId: 'cid' } as never;
    const verified = { verified: true, authenticationInfo: { newCounter: 6 } };
    const ready = () => {
      const s = setup();
      s.redis.get.mockResolvedValue('AC');
      s.credRepo.findOne.mockResolvedValue(credRow());
      return s;
    };

    it('rejects when challenge missing/expired/replayed', async () => {
      const { svc, redis } = setup();
      redis.get.mockResolvedValue(null);
      expect(await apiCode(svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
    });
    it('rejects a credential not owned by this user/tenant', async () => {
      const { svc, redis, credRepo } = setup();
      redis.get.mockResolvedValue('AC');
      credRepo.findOne.mockResolvedValue(null);
      expect(await apiCode(svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
      expect(credRepo.findOne.mock.calls[0][0].where).toEqual({ userId: U, tenantId: T, credentialId: 'cid' });
    });
    it('falls back to response.id when rawId absent', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockResolvedValue(verified);
      await s.svc.finishAuthentication(U, T, { id: 'cid' } as never, 'n');
      expect(s.credRepo.findOne.mock.calls[0][0].where.credentialId).toBe('cid');
    });
    it('succeeds, advancing the counter with compare-and-set on the old value', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockResolvedValue(verified);
      await expect(s.svc.finishAuthentication(U, T, resp, 'n')).resolves.toBe(true);
      expect(s.qb.set).toHaveBeenCalledWith({ counter: 6, lastUsedAt: NOW });
      expect(s.qb.where).toHaveBeenCalledWith('id = :id AND counter = :oldCounter', { id: 'row1', oldCounter: 5 });
      expect(swa.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({ expectedChallenge: 'AC', credential: expect.objectContaining({ counter: 5, id: 'cid' }) }));
    });
    it('generic verifier error -> PASSKEY_INVALID without retiring credential', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockRejectedValue(new Error('bad signature'));
      expect(await apiCode(s.svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
      expect(s.credRepo.delete).not.toHaveBeenCalled();
    });
    it('non-Error throw -> PASSKEY_INVALID', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockRejectedValue('weird');
      expect(await apiCode(s.svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
    });
    it('verified=false -> PASSKEY_INVALID and counter untouched', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockResolvedValue({ verified: false });
      expect(await apiCode(s.svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
      expect(s.qb.execute).not.toHaveBeenCalled();
    });
    it.each([[{ affected: 0 }], [{}]])('lost counter race %j -> PASSKEY_INVALID', async (r) => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockResolvedValue(verified);
      s.qb.execute.mockResolvedValue(r);
      expect(await apiCode(s.svc.finishAuthentication(U, T, resp, 'n'))).toBe('PASSKEY_INVALID');
    });
    it('counter regression retires the cloned credential, keeps flag when others remain', async () => {
      const s = ready();
      (swa.verifyAuthenticationResponse as jest.Mock).mockRejectedValue(new Error('Response counter value 3 was lower than expected 5'));
      s.credRepo.count.mockResolvedValue(2);
      s.userRepo.findOne.mockRejectedValue(new Error('x'));
      expect(await apiCode(s.svc.finishAuthentication(U, T, resp, 'n', { ipAddress: '1.1.1.1', userAgent: 'ua', requestId: 'r' }))).toBe('PASSKEY_INVALID');
      expect(s.credRepo.delete).toHaveBeenCalled();
      expect(s.mfaRepo.update).not.toHaveBeenCalled();
      expect(s.domain.publish).toHaveBeenCalledWith(DomainEventName.PASSKEY_REMOVED, expect.objectContaining({ email: undefined, ip: '1.1.1.1' }));
    });
  });

  describe('credential management', () => {
    it('listCredentials maps rows with defaults', async () => {
      const { svc, credRepo } = setup();
      credRepo.find.mockResolvedValue([
        credRow({ deviceName: 'Mac', createdAt: NOW, lastUsedAt: NOW }),
        credRow({ credentialId: 'c2', deviceName: null, transports: null, createdAt: NOW }),
      ]);
      const out = await svc.listCredentials(U, T);
      expect(out[0]).toEqual({ id: 'cid', deviceName: 'Mac', createdAt: NOW, lastUsedAt: NOW, transports: ['internal'] });
      expect(out[1]).toMatchObject({ id: 'c2', deviceName: 'Unnamed Device', transports: [] });
    });
    it('deleteCredential 404s when not owned', async () => {
      const { svc, credRepo } = setup();
      credRepo.findOne.mockResolvedValue(null);
      expect(await apiCode(svc.deleteCredential(U, T, 'cid'))).toBe('RESOURCE_NOT_FOUND');
      expect(credRepo.delete).not.toHaveBeenCalled();
    });
    it('deleteCredential disables flag only when last passkey removed', async () => {
      const a = setup();
      a.credRepo.findOne.mockResolvedValue(credRow());
      a.credRepo.count.mockResolvedValue(0);
      await a.svc.deleteCredential(U, T, 'cid', { ipAddress: 'ip', userAgent: 'ua', requestId: 'r' });
      expect(a.mfaRepo.update).toHaveBeenCalledWith({ userId: U, tenantId: T }, { webauthnEnabled: false });
      expect(a.events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'passkey.removed', ipAddress: 'ip', requestId: 'r' }));
      const b = setup();
      b.credRepo.findOne.mockResolvedValue(credRow());
      b.credRepo.count.mockResolvedValue(1);
      await b.svc.deleteCredential(U, T, 'cid');
      expect(b.mfaRepo.update).not.toHaveBeenCalled();
    });
  });

  it('uses localhost defaults when unconfigured', async () => {
    const { svc, redis } = setup();
    redis.get.mockResolvedValue('CH');
    (swa.verifyRegistrationResponse as jest.Mock).mockRejectedValue(new Error('x'));
    await svc.finishRegistration(U, T, { response: {} } as never).catch(() => undefined);
    expect(swa.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({ expectedOrigin: 'http://localhost:3000', expectedRPID: 'localhost' }));
  });
});

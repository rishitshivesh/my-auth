import * as crypto from 'crypto';
import { ProtocolException } from '@/common/http';
import { OAuthTokenService } from './oauth-token.service';

jest.mock('@/common/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const NOW = new Date('2026-01-01T00:00:00.000Z');
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const s256 = (v: string) => crypto.createHash('sha256').update(v).digest('base64url');

type Repo = {
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};
const repo = (): Repo => ({
  findOne: jest.fn(),
  save: jest.fn(async (v: unknown) => v),
  update: jest.fn(async () => ({ affected: 1 })),
  delete: jest.fn(),
});

const client = (over: Record<string, unknown> = {}) => ({
  id: 'c-uuid',
  clientId: 'client_abc',
  tenantId: 't1',
  authorizationCodeTtl: 600,
  accessTokenTtl: 900,
  refreshTokenTtl: 604800,
  idTokenTtl: 3600,
  ...over,
});

function setup() {
  const authCodes = repo();
  const accessTokens = repo();
  const refreshTokens = repo();
  const clients = repo();
  const users = repo();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt'), verify: jest.fn(), decode: jest.fn() };
  const config = { get: jest.fn((_k: string, d: string) => d) };
  const jwks = {
    getCurrentSigningKey: jest.fn().mockResolvedValue({ kid: 'kid-1', privateKey }),
    getPublicKeyForToken: jest.fn().mockResolvedValue(publicKey),
  };
  const svc = new OAuthTokenService(
    authCodes as never,
    accessTokens as never,
    refreshTokens as never,
    clients as never,
    users as never,
    jwt as never,
    config as never,
    jwks as never,
  );
  return { svc, authCodes, accessTokens, refreshTokens, clients, jwt, config, jwks };
}

const expectOAuth = async (p: Promise<unknown>, error: string, status: number) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ProtocolException);
  expect((e as ProtocolException).body.error).toBe(error);
  expect((e as ProtocolException).getStatus()).toBe(status);
};

describe('OAuthTokenService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('createAuthorizationCode', () => {
    const dto = { tenantId: 't1', clientId: 'c-uuid', userId: 'u1', redirectUri: 'https://a/cb' };

    it('stores only the hash of the code and expiry from client TTL', async () => {
      const { svc, clients, authCodes } = setup();
      clients.findOne.mockResolvedValue(client());
      const code = await svc.createAuthorizationCode({ ...dto, codeChallenge: 'x', codeChallengeMethod: 'S256' });
      const saved = authCodes.save.mock.calls[0][0];
      expect(saved.codeHash).toBe(sha(code));
      expect(saved.codeHash).not.toBe(code);
      expect(saved.expiresAt).toEqual(new Date(NOW.getTime() + 600_000));
      expect(code.length).toBeGreaterThanOrEqual(43);
    });

    it('generates unique codes', async () => {
      const { svc, clients } = setup();
      clients.findOne.mockResolvedValue(client());
      const a = await svc.createAuthorizationCode(dto);
      const b = await svc.createAuthorizationCode(dto);
      expect(a).not.toBe(b);
    });

    it('rejects unknown client', async () => {
      const { svc, clients, authCodes } = setup();
      clients.findOne.mockResolvedValue(null);
      await expectOAuth(svc.createAuthorizationCode(dto), 'invalid_client', 401);
      expect(authCodes.update).not.toHaveBeenCalled();
    });
  });

  describe('validateAuthorizationCode', () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const stored = (over: Record<string, unknown> = {}) => ({
      userId: 'u1',
      redirectUri: 'https://a/cb',
      expiresAt: new Date(NOW.getTime() + 1000),
      codeChallenge: s256(verifier),
      codeChallengeMethod: 'S256',
      usedAt: null,
      ...over,
    });

    it('consumes a valid code (marks usedAt) and looks up by hash + client', async () => {
      const { svc, authCodes } = setup();
      const row = stored();
      authCodes.findOne.mockResolvedValue(row);
      const out = await svc.validateAuthorizationCode('the-code', 'c1', 'https://a/cb', verifier);
      expect(out.usedAt).toEqual(NOW);
      expect(authCodes.update).toHaveBeenCalledWith({ codeHash: sha('the-code'), usedAt: expect.anything() }, { usedAt: NOW });
      expect(authCodes.findOne.mock.calls[0][0].where).toMatchObject({ codeHash: sha('the-code'), clientId: 'c1' });
    });

    it('two concurrent exchanges of one code: the loser gets invalid_grant', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored());
      let consumed = false;
      authCodes.update.mockImplementation(async () => {
        const affected = consumed ? 0 : 1;
        consumed = true;
        return { affected };
      });
      const results = await Promise.allSettled([
        svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier),
        svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await expectOAuth(Promise.reject((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason), 'invalid_grant', 400);
    });

    it('rejects unknown/used code', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(null);
      await expectOAuth(svc.validateAuthorizationCode('x', 'c', 'u', verifier), 'invalid_grant', 400);
    });

    it('rejects expired code and does not consume it', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored({ expiresAt: new Date(NOW.getTime() - 1) }));
      await expectOAuth(svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier), 'invalid_grant', 400);
      expect(authCodes.update).not.toHaveBeenCalled();
    });

    it('accepts a code at the exact expiry instant (boundary)', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored({ expiresAt: new Date(NOW.getTime()) }));
      await expect(svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier)).resolves.toBeDefined();
    });

    it('rejects redirect_uri mismatch (including near-miss)', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored());
      await expectOAuth(svc.validateAuthorizationCode('x', 'c', 'https://a/cb/', verifier), 'invalid_grant', 400);
      expect(authCodes.update).not.toHaveBeenCalled();
    });

    it('requires code_verifier when a challenge was registered', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored());
      await expectOAuth(svc.validateAuthorizationCode('x', 'c', 'https://a/cb'), 'invalid_grant', 400);
    });

    it('rejects PKCE mismatch without consuming the code', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored());
      await expectOAuth(
        svc.validateAuthorizationCode('x', 'c', 'https://a/cb', 'z'.repeat(43)),
        'invalid_grant',
        400,
      );
      expect(authCodes.update).not.toHaveBeenCalled();
    });

    it('rejects legacy plain challenge method', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored({ codeChallengeMethod: 'plain' }));
      await expectOAuth(svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier), 'invalid_request', 400);
    });

    it('defaults method to S256 when unset', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored({ codeChallengeMethod: null }));
      await expect(svc.validateAuthorizationCode('x', 'c', 'https://a/cb', verifier)).resolves.toBeDefined();
    });

    it('skips PKCE when no challenge was stored', async () => {
      const { svc, authCodes } = setup();
      authCodes.findOne.mockResolvedValue(stored({ codeChallenge: null }));
      await expect(svc.validateAuthorizationCode('x', 'c', 'https://a/cb')).resolves.toBeDefined();
    });
  });

  describe('validatePKCE', () => {
    it('is length-safe with a challenge of different length', async () => {
      const { svc } = setup();
      await expect(svc.validatePKCE('a'.repeat(43), 'short', 'S256')).resolves.toBe(false);
    });
    it('accepts 128-char verifier, rejects 129 and 42', async () => {
      const { svc } = setup();
      const v128 = 'a'.repeat(128);
      await expect(svc.validatePKCE(v128, s256(v128), 'S256')).resolves.toBe(true);
      const v129 = 'a'.repeat(129);
      await expect(svc.validatePKCE(v129, s256(v129), 'S256')).resolves.toBe(false);
      const v42 = 'a'.repeat(42);
      await expect(svc.validatePKCE(v42, s256(v42), 'S256')).resolves.toBe(false);
    });
  });

  describe('createAccessToken', () => {
    const dto = { tenantId: 't1', clientId: 'c-uuid', userId: 'u1' };

    it('builds claims, signs RS256 with kid for tenant, stores only the jti hash', async () => {
      const { svc, clients, jwt, jwks, accessTokens } = setup();
      clients.findOne.mockResolvedValue(client());
      const token = await svc.createAccessToken(
        { ...dto, scope: 'openid', sessionId: 's1', audience: 'api' },
        { email: 'a@b.c', emailVerified: true } as never,
      );
      expect(token).toBe('signed.jwt');
      expect(jwks.getCurrentSigningKey).toHaveBeenCalledWith('t1');
      const [payload, opts] = jwt.sign.mock.calls[0];
      expect(payload).toMatchObject({
        sub: 'u1',
        aud: 'api',
        client_id: 'client_abc',
        tenant_id: 't1',
        token_type: 'access_token',
        scope: 'openid',
        session_id: 's1',
        email: 'a@b.c',
        email_verified: true,
        iss: 'https://sentry.scrolloop.com',
        iat: Math.floor(NOW.getTime() / 1000),
        exp: Math.floor(NOW.getTime() / 1000) + 900,
      });
      expect(opts).toMatchObject({ algorithm: 'RS256', header: { alg: 'RS256', kid: 'kid-1' } });
      expect(opts).not.toHaveProperty('expiresIn'); // payload carries absolute exp; jsonwebtoken rejects both
      expect(opts.privateKey).toContain('BEGIN PRIVATE KEY');
      const rec = accessTokens.save.mock.calls[0][0];
      expect(rec.tokenHash).toBe(sha(payload.jti));
      expect(rec.expiresAt).toEqual(new Date(NOW.getTime() + 900_000));
    });

    it('uses client id as subject/audience for M2M and omits optional claims', async () => {
      const { svc, clients, jwt } = setup();
      clients.findOne.mockResolvedValue(client());
      await svc.createAccessToken({ tenantId: 't1', clientId: 'c-uuid' });
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.sub).toBe('c-uuid');
      expect(payload.aud).toBe('c-uuid');
      expect(payload).not.toHaveProperty('scope');
      expect(payload).not.toHaveProperty('session_id');
      expect(payload).not.toHaveProperty('email');
    });

    it('rejects unknown client without signing', async () => {
      const { svc, clients, jwt } = setup();
      clients.findOne.mockResolvedValue(null);
      await expectOAuth(svc.createAccessToken(dto), 'invalid_client', 401);
      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe('validateAccessToken', () => {
    const rec = (over: Record<string, unknown> = {}) => ({
      expiresAt: new Date(NOW.getTime() + 1000),
      useCount: 2,
      lastUsedAt: null,
      ...over,
    });

    it('verifies RS256 only, checks revocation by jti hash, bumps usage', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.verify.mockReturnValue({ jti: 'jti-1' });
      accessTokens.findOne.mockResolvedValue(rec());
      const out = await svc.validateAccessToken('tok');
      expect(jwt.verify.mock.calls[0][1]).toMatchObject({ algorithms: ['RS256'] });
      expect(accessTokens.findOne.mock.calls[0][0].where.tokenHash).toBe(sha('jti-1'));
      expect(out.useCount).toBe(3);
      expect(out.lastUsedAt).toEqual(NOW);
    });

    it('maps bad signature/expired JWT to invalid_token 401 with challenge', async () => {
      const { svc, jwt } = setup();
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const e = await svc.validateAccessToken('forged').catch((x: ProtocolException) => x);
      expect(e).toBeInstanceOf(ProtocolException);
      expect((e as ProtocolException).getStatus()).toBe(401);
      expect((e as ProtocolException).headers['WWW-Authenticate']).toContain('invalid_token');
    });

    it('maps unknown key id (getPublicKeyForToken failure) to invalid_token', async () => {
      const { svc, jwks } = setup();
      jwks.getPublicKeyForToken.mockRejectedValue(new Error('no kid'));
      await expectOAuth(svc.validateAccessToken('t'), 'invalid_token', 401);
    });

    it('rejects revoked/unknown token record', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.verify.mockReturnValue({ jti: 'j' });
      accessTokens.findOne.mockResolvedValue(null);
      await expectOAuth(svc.validateAccessToken('t'), 'invalid_token', 401);
    });

    it('rejects when stored record expired', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.verify.mockReturnValue({ jti: 'j' });
      accessTokens.findOne.mockResolvedValue(rec({ expiresAt: new Date(NOW.getTime() - 1) }));
      await expectOAuth(svc.validateAccessToken('t'), 'invalid_token', 401);
      expect(accessTokens.save).not.toHaveBeenCalled();
    });

    // A validly signed JWT lacking jti should be an invalid_token, not a TypeError/500.
    it('returns invalid_token (not a TypeError) when verified payload has no jti', async () => {
      const { svc, jwt } = setup();
      jwt.verify.mockReturnValue({ sub: 'x' });
      await expectOAuth(svc.validateAccessToken('t'), 'invalid_token', 401);
    });
  });

  describe('revokeAccessToken', () => {
    it('revokes by jti hash with reason', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.decode.mockReturnValue({ jti: 'j1' });
      await svc.revokeAccessToken('t', 'why');
      expect(accessTokens.update).toHaveBeenCalledWith(
        { tokenHash: sha('j1') },
        { revokedAt: NOW, revokedReason: 'why' },
      );
    });
    it('defaults reason to user_revoked', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.decode.mockReturnValue({ jti: 'j1' });
      await svc.revokeAccessToken('t');
      expect(accessTokens.update.mock.calls[0][1].revokedReason).toBe('user_revoked');
    });
    it.each([[null], [{}]])('is a no-op for undecodable token %p', async (decoded) => {
      const { svc, jwt, accessTokens } = setup();
      jwt.decode.mockReturnValue(decoded);
      await svc.revokeAccessToken('t');
      expect(accessTokens.update).not.toHaveBeenCalled();
    });
  });

  describe('refresh tokens', () => {
    it('createRefreshToken stores hash, new family by default, TTL from client', async () => {
      const { svc, clients, refreshTokens } = setup();
      clients.findOne.mockResolvedValue(client());
      const token = await svc.createRefreshToken({ tenantId: 't1', clientId: 'c', userId: 'u1' });
      const saved = refreshTokens.save.mock.calls[0][0];
      expect(saved.tokenHash).toBe(sha(token));
      expect(saved.familyId).toMatch(/^[0-9a-f-]{36}$/);
      expect(saved.expiresAt).toEqual(new Date(NOW.getTime() + 604800_000));
    });

    it('createRefreshToken keeps provided family', async () => {
      const { svc, clients, refreshTokens } = setup();
      clients.findOne.mockResolvedValue(client());
      await svc.createRefreshToken({ tenantId: 't1', clientId: 'c', userId: 'u1', familyId: 'fam', parentTokenId: 'p' });
      expect(refreshTokens.save.mock.calls[0][0]).toMatchObject({ familyId: 'fam', parentTokenId: 'p' });
    });

    it('createRefreshToken rejects unknown client', async () => {
      const { svc, clients } = setup();
      clients.findOne.mockResolvedValue(null);
      await expectOAuth(svc.createRefreshToken({ tenantId: 't', clientId: 'c', userId: 'u' }), 'invalid_client', 401);
    });

    const rt = (over: Record<string, unknown> = {}) => ({
      id: 'rt1',
      familyId: 'fam',
      userId: 'u1',
      tenantId: 't1',
      clientId: 'c',
      scope: 'openid',
      deviceId: 'd',
      ipAddress: '1.1.1.1',
      userAgent: 'ua',
      usedAt: null,
      expiresAt: new Date(NOW.getTime() + 1000),
      ...over,
    });

    it('validateRefreshToken returns a live token', async () => {
      const { svc, refreshTokens } = setup();
      refreshTokens.findOne.mockResolvedValue(rt());
      await expect(svc.validateRefreshToken('tok')).resolves.toMatchObject({ id: 'rt1' });
      expect(refreshTokens.findOne.mock.calls[0][0].where.tokenHash).toBe(sha('tok'));
    });

    it('validateRefreshToken rejects unknown and expired', async () => {
      const { svc, refreshTokens } = setup();
      refreshTokens.findOne.mockResolvedValueOnce(null);
      await expectOAuth(svc.validateRefreshToken('t'), 'invalid_grant', 400);
      refreshTokens.findOne.mockResolvedValueOnce(rt({ expiresAt: new Date(NOW.getTime() - 1) }));
      await expectOAuth(svc.validateRefreshToken('t'), 'invalid_grant', 400);
    });

    it('detects reuse: revokes whole family then rejects', async () => {
      const { svc, refreshTokens } = setup();
      refreshTokens.findOne.mockResolvedValue(rt({ usedAt: new Date(NOW.getTime() - 5) }));
      await expectOAuth(svc.validateRefreshToken('replayed'), 'invalid_grant', 400);
      expect(refreshTokens.update).toHaveBeenCalledTimes(1);
      const [where, set] = refreshTokens.update.mock.calls[0];
      expect(where.familyId).toBe('fam');
      expect(set).toMatchObject({ revokedReason: 'token_reuse_detected' });
    });

    it('rotateRefreshToken retires old token and issues same-family child', async () => {
      const { svc, clients, refreshTokens } = setup();
      clients.findOne.mockResolvedValue(client());
      const old = rt();
      const fresh = await svc.rotateRefreshToken(old as never);
      expect(old).toMatchObject({ usedAt: NOW, revokedAt: NOW, revokedReason: 'rotated' });
      const created = refreshTokens.save.mock.calls[0][0];
      expect(created).toMatchObject({ familyId: 'fam', parentTokenId: 'rt1', scope: 'openid', deviceId: 'd' });
      expect(created.tokenHash).toBe(sha(fresh));
    });

    it('rotateRefreshToken: lost race revokes the family and issues no child', async () => {
      const { svc, refreshTokens } = setup();
      refreshTokens.update.mockResolvedValueOnce({ affected: 0 });
      await expectOAuth(svc.rotateRefreshToken(rt() as never), 'invalid_grant', 400);
      expect(refreshTokens.update.mock.calls[1][1].revokedReason).toBe('token_reuse_detected');
      expect(refreshTokens.save).not.toHaveBeenCalled();
    });

    it('revokeRefreshToken / Family / AllUser use correct selectors', async () => {
      const { svc, refreshTokens } = setup();
      await svc.revokeRefreshToken('tok');
      expect(refreshTokens.update).toHaveBeenLastCalledWith(
        { tokenHash: sha('tok') },
        { revokedAt: NOW, revokedReason: 'user_revoked' },
      );
      await svc.revokeRefreshTokenFamily('fam');
      expect(refreshTokens.update.mock.calls[1][1].revokedReason).toBe('token_reuse_detected');
      await svc.revokeAllUserRefreshTokens('u1', 't1');
      expect(refreshTokens.update.mock.calls[2][0]).toMatchObject({ userId: 'u1', tenantId: 't1' });
      expect(refreshTokens.update.mock.calls[2][1].revokedReason).toBe('logout_all');
    });

    it('revokeAllClientTokens revokes access and refresh tokens scoped by tenant', async () => {
      const { svc, refreshTokens, accessTokens } = setup();
      await svc.revokeAllClientTokens('c1', 't1');
      for (const r of [refreshTokens, accessTokens]) {
        expect(r.update.mock.calls[0][0]).toMatchObject({ clientId: 'c1', tenantId: 't1' });
        expect(r.update.mock.calls[0][1].revokedReason).toBe('client_revoked');
      }
    });
  });

  describe('createIDToken', () => {
    const user = { id: 'u1', email: 'a@b.c', emailVerified: true, firstName: 'Ada ', lastName: 'L', avatarUrl: 'http://p' };
    it('includes OIDC claims, nonce, picture, and signs with the client tenant key', async () => {
      const { svc, jwt, jwks } = setup();
      await svc.createIDToken(user as never, client() as never, 'n0nce');
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload).toMatchObject({
        sub: 'u1',
        aud: 'client_abc',
        nonce: 'n0nce',
        name: 'Ada  L',
        given_name: 'Ada ',
        family_name: 'L',
        picture: 'http://p',
        exp: Math.floor(NOW.getTime() / 1000) + 3600,
      });
      expect(jwks.getCurrentSigningKey).toHaveBeenCalledWith('t1');
    });
    it('omits picture when no avatar', async () => {
      const { svc, jwt } = setup();
      await svc.createIDToken({ ...user, avatarUrl: null } as never, client() as never);
      expect(jwt.sign.mock.calls[0][0]).not.toHaveProperty('picture');
    });
    it('adds sid, auth_time, amr and acr from the authentication context', async () => {
      const { svc, jwt } = setup();
      await svc.createIDToken(user as never, client() as never, 'n', {
        sessionId: 's1', authTime: new Date('2025-12-31T23:00:00.000Z'), amr: ['pwd'],
      });
      expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sid: 's1', auth_time: 1767222000, amr: ['pwd'], acr: '1' });
    });
    it('reports a multi-factor acr when amr includes mfa and omits the context when absent', async () => {
      const { svc, jwt } = setup();
      await svc.createIDToken(user as never, client() as never, 'n', { amr: ['pwd', 'mfa'] });
      expect(jwt.sign.mock.calls[0][0]).toMatchObject({ acr: '2' });
      await svc.createIDToken(user as never, client() as never);
      const plain = jwt.sign.mock.calls[1][0];
      for (const claim of ['sid', 'auth_time', 'amr', 'acr']) expect(plain).not.toHaveProperty(claim);
    });
  });

  describe('verifyIdTokenHint', () => {
    it('accepts an ID token ignoring expiry and returns audience, subject and sid', async () => {
      const { svc, jwt } = setup();
      jwt.verify.mockReturnValue({ aud: 'client_abc', sub: 'u1', sid: 's1' });
      await expect(svc.verifyIdTokenHint('a.b.c')).resolves.toEqual({ audience: 'client_abc', subject: 'u1', sessionId: 's1' });
      expect(jwt.verify.mock.calls[0][1]).toMatchObject({ algorithms: ['RS256'], ignoreExpiration: true, issuer: expect.any(String) });
    });
    it('rejects bad signatures, access tokens and purpose-bound tokens', async () => {
      const { svc, jwt } = setup();
      jwt.verify.mockImplementation(() => { throw new Error('bad'); });
      await expectOAuth(svc.verifyIdTokenHint('a.b.c'), 'invalid_request', 400);
      for (const extra of [{ token_type: 'access_token' }, { type: 'mfa_pending' }, { purpose: 'x' }, { mode: 'link' }]) {
        jwt.verify.mockReturnValue({ aud: 'client_abc', sub: 'u1', ...extra });
        await expectOAuth(svc.verifyIdTokenHint('a.b.c'), 'invalid_request', 400);
      }
      jwt.verify.mockReturnValue({ sub: 'u1' });
      await expectOAuth(svc.verifyIdTokenHint('a.b.c'), 'invalid_request', 400);
    });
  });

  describe('revokeSessionTokens', () => {
    it('revokes only this tenant and session\'s access and refresh tokens', async () => {
      const { svc, accessTokens, refreshTokens } = setup();
      await svc.revokeSessionTokens('t1', 's1', 'rp_initiated_logout');
      for (const r of [accessTokens, refreshTokens]) {
        expect(r.update.mock.calls[0][0]).toMatchObject({ tenantId: 't1', sessionId: 's1' });
        expect(r.update.mock.calls[0][1]).toMatchObject({ revokedReason: 'rp_initiated_logout' });
      }
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deletes with 1-day cutoff for codes/access and 30-day for refresh', async () => {
      const { svc, authCodes, accessTokens, refreshTokens } = setup();
      authCodes.delete.mockResolvedValue({ affected: 2 });
      accessTokens.delete.mockResolvedValue({});
      refreshTokens.delete.mockResolvedValue({ affected: 1 });
      await svc.cleanupExpiredTokens();
      const cutoff = (r: Repo) => (r.delete.mock.calls[0][0].expiresAt as { value: Date }).value.getTime();
      expect(cutoff(authCodes)).toBe(NOW.getTime() - 86_400_000);
      expect(cutoff(accessTokens)).toBe(NOW.getTime() - 86_400_000);
      expect(cutoff(refreshTokens)).toBe(NOW.getTime() - 30 * 86_400_000);
    });
  });

  describe('introspectToken', () => {
    const payload = { jti: 'j', client_id: 'cid', email: 'a@b.c', exp: 10, iat: 5, sub: 'u1', aud: 'api' };

    it('returns active metadata for a live access token', async () => {
      const { svc, jwt, accessTokens } = setup();
      jwt.verify.mockReturnValue(payload);
      accessTokens.findOne.mockResolvedValue({ scope: 'openid', revokedAt: null });
      await expect(svc.introspectToken('t')).resolves.toEqual({
        active: true,
        scope: 'openid',
        client_id: 'cid',
        username: 'a@b.c',
        token_type: 'Bearer',
        exp: 10,
        iat: 5,
        sub: 'u1',
        aud: 'api',
      });
    });

    it.each([[null], [{ revokedAt: new Date() }]])('inactive for missing/revoked access record %p', async (row) => {
      const { svc, jwt, accessTokens } = setup();
      jwt.verify.mockReturnValue(payload);
      accessTokens.findOne.mockResolvedValue(row);
      await expect(svc.introspectToken('t')).resolves.toEqual({ active: false });
    });

    it('falls back to refresh token lookup when not a valid JWT', async () => {
      const { svc, jwt, refreshTokens } = setup();
      jwt.verify.mockImplementation(() => {
        throw new Error('bad');
      });
      refreshTokens.findOne.mockResolvedValue({
        scope: 's',
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() + 5000),
        client: { clientId: 'cid' },
        user: { email: 'a@b.c' },
        userId: 'u1',
      });
      await expect(svc.introspectToken('opaque')).resolves.toEqual({
        active: true,
        scope: 's',
        client_id: 'cid',
        username: 'a@b.c',
        token_type: 'refresh_token',
        exp: Math.floor(NOW.getTime() / 1000) + 5,
        sub: 'u1',
      });
    });

    it.each([
      ['missing', null],
      ['revoked', { revokedAt: new Date(), expiresAt: new Date(NOW.getTime() + 1) }],
      ['expired', { revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) }],
    ])('refresh fallback inactive when %s', async (_n, row) => {
      const { svc, jwt, refreshTokens } = setup();
      jwt.verify.mockImplementation(() => {
        throw new Error('bad');
      });
      refreshTokens.findOne.mockResolvedValue(row);
      await expect(svc.introspectToken('opaque')).resolves.toEqual({ active: false });
    });
  });
});

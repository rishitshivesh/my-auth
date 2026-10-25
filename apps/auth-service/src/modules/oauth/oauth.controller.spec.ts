import { ApiException, ProtocolException } from '@/common/http';
import { OAuthController } from './oauth.controller';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const NOW = new Date('2026-01-01T00:00:00.000Z');
const basic = (id: string, secret: string) => 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

function setup() {
  const clientService = {
    getClient: jest.fn(),
    getClientForTenant: jest.fn(),
    validateRedirectUri: jest.fn().mockResolvedValue(true),
    validateGrantType: jest.fn().mockResolvedValue(true),
    validateScopes: jest.fn(async (_c: unknown, s: string[]) => s),
    validateClient: jest.fn(),
    createClient: jest.fn(),
    listClients: jest.fn(),
    updateClient: jest.fn(),
    deleteClient: jest.fn(),
    rotateClientSecret: jest.fn(),
  };
  const tokenService = {
    createAuthorizationCode: jest.fn().mockResolvedValue('CODE'),
    validateAuthorizationCode: jest.fn(),
    createAccessToken: jest.fn().mockResolvedValue('AT'),
    createRefreshToken: jest.fn().mockResolvedValue('RT'),
    createIDToken: jest.fn().mockResolvedValue('IDT'),
    validateRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn().mockResolvedValue('RT2'),
    revokeRefreshToken: jest.fn(),
    revokeAccessToken: jest.fn(),
    introspectToken: jest.fn().mockResolvedValue({ active: true }),
  };
  const consentService = {
    getConsent: jest.fn().mockResolvedValue(null),
    isConsentRequired: jest.fn().mockResolvedValue(false),
    grantConsent: jest.fn(),
  };
  const config = { get: jest.fn((k: string, d?: string) => d) };
  const jwks = { getVerificationKeys: jest.fn().mockResolvedValue([{ kid: 'k' }]) };
  const ctl = new OAuthController(clientService as never, tokenService as never, consentService as never, config as never, jwks as never);
  return { ctl, clientService, tokenService, consentService, jwks };
}

const confidential = { id: 'cid', clientId: 'client_x', clientType: 'confidential', accessTokenTtl: 900, requirePkce: false };
const req = (over: Record<string, unknown> = {}) =>
  ({ tenantId: 't1', ip: '9.9.9.9', url: '/oauth/authorize?x=1', user: { userId: 'u1', sub: 'u1' }, headers: {}, get: jest.fn(() => 'ua'), ...over }) as never;

const oauthErr = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ProtocolException);
  return (e as ProtocolException).body.error;
};

describe('OAuthController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe('token', () => {
    it('requires client_id', async () => {
      const { ctl } = setup();
      expect(await oauthErr(ctl.token({ grant_type: 'authorization_code' } as never, req()))).toBe('invalid_request');
    });

    it('rejects unsupported grant types (password, implicit)', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      for (const g of ['password', 'implicit']) {
        expect(await oauthErr(ctl.token({ grant_type: g, client_id: 'client_x' } as never, req()))).toBe('unsupported_grant_type');
      }
      expect(await oauthErr(ctl.token({ grant_type: '', client_id: 'client_x' } as never, req()))).toBe('invalid_request');
    });

    it('authenticates via Basic header over body credentials', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      await ctl.token({ grant_type: 'client_credentials', client_id: 'body', client_secret: 'bodysecret' } as never, req(), basic('hdr', 'hsec'));
      expect(clientService.validateClient).toHaveBeenCalledWith('hdr', 'hsec');
    });

    it('authenticates via body credentials without header', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      await ctl.token({ grant_type: 'client_credentials', client_id: 'b', client_secret: 's' } as never, req());
      expect(clientService.validateClient).toHaveBeenCalledWith('b', 's');
      await ctl.token({ grant_type: 'client_credentials', client_id: 'b' } as never, req(), 'Bearer zzz');
      expect(clientService.validateClient).toHaveBeenLastCalledWith('b', undefined);
    });

    it('propagates invalid client credentials', async () => {
      const { ctl, clientService, tokenService } = setup();
      clientService.validateClient.mockRejectedValue(new ProtocolException(401, { error: 'invalid_client' }));
      expect(await oauthErr(ctl.token({ grant_type: 'client_credentials', client_id: 'c', client_secret: 'x' } as never, req()))).toBe('invalid_client');
      expect(tokenService.createAccessToken).not.toHaveBeenCalled();
    });

    // BUG oauth.controller.ts parseClientCredentials: `decoded.split(":")` truncates secrets containing ':'
    // (RFC 6749 2.3.1 allows any printable char; only the first ':' separates id and secret).
    it('keeps colons inside the Basic-auth client secret', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      await ctl.token({ grant_type: 'client_credentials' } as never, req(), basic('id', 'se:cret'));
      expect(clientService.validateClient).toHaveBeenCalledWith('id', 'se:cret');
    });

    it('URL-decodes Basic credentials (RFC 6749 2.3.1) and splits on the first colon only', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      const header = 'Basic ' + Buffer.from('my%20id:p%2Bw%3Ad+x:y').toString('base64');
      await ctl.token({ grant_type: 'client_credentials' } as never, req(), header);
      expect(clientService.validateClient).toHaveBeenCalledWith('my id', 'p+w:d x:y');
    });

    it.each([
      ['not base64', 'Basic @@@'],
      ['no colon', 'Basic ' + Buffer.from('justid').toString('base64')],
      ['empty client id', 'Basic ' + Buffer.from(':secret').toString('base64')],
      ['bad percent-encoding', 'Basic ' + Buffer.from('id:%E0%A4%A').toString('base64')],
    ])('rejects malformed Basic header (%s) as invalid_client', async (_n, header) => {
      const { ctl, clientService } = setup();
      expect(await oauthErr(ctl.token({ grant_type: 'client_credentials' } as never, req(), header))).toBe('invalid_client');
      expect(clientService.validateClient).not.toHaveBeenCalled();
    });

    // BUG oauth.controller.ts token(): clientService.validateGrantType is never called, so a client not
    // registered for a grant can still use it (e.g. authorization_code-only client minting client_credentials tokens).
    it('enforces the client registered grant_types', async () => {
      const { ctl, clientService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      clientService.validateGrantType.mockRejectedValue(new ProtocolException(400, { error: 'unauthorized_client' }));
      await expect(ctl.token({ grant_type: 'client_credentials', client_id: 'c', client_secret: 's' } as never, req())).rejects.toBeDefined();
    });

    describe('authorization_code grant', () => {
      const body = { grant_type: 'authorization_code', client_id: 'c', code: 'CODE', redirect_uri: 'https://a/cb', code_verifier: 'v' } as never;
      const authCode = { userId: 'u1', scope: 'openid profile', nonce: 'n', user: { id: 'u1' } };

      it('returns access, refresh and id token for openid scope', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        tokenService.validateAuthorizationCode.mockResolvedValue(authCode);
        const out = await ctl.token(body, req());
        expect(tokenService.validateAuthorizationCode).toHaveBeenCalledWith('CODE', 'cid', 'https://a/cb', 'v');
        expect(tokenService.createIDToken).toHaveBeenCalledWith({ id: 'u1' }, confidential, 'n', expect.objectContaining({}));
        expect(out).toEqual({ access_token: 'AT', token_type: 'Bearer', expires_in: 900, refresh_token: 'RT', id_token: 'IDT', scope: 'openid profile' });
      });

      it('omits id_token without openid scope (and with undefined scope)', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        tokenService.validateAuthorizationCode.mockResolvedValue({ ...authCode, scope: 'email' });
        expect((await ctl.token(body, req())).id_token).toBeUndefined();
        tokenService.validateAuthorizationCode.mockResolvedValue({ ...authCode, scope: undefined });
        expect((await ctl.token(body, req())).id_token).toBeUndefined();
        expect(tokenService.createIDToken).not.toHaveBeenCalled();
      });

      it.each([
        ['code', { grant_type: 'authorization_code', client_id: 'c', redirect_uri: 'r' }],
        ['redirect_uri', { grant_type: 'authorization_code', client_id: 'c', code: 'x' }],
      ])('requires %s', async (_n, b) => {
        const { ctl, clientService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        expect(await oauthErr(ctl.token(b as never, req()))).toBe('invalid_request');
      });

      it('propagates PKCE / replay failures without minting tokens', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        tokenService.validateAuthorizationCode.mockRejectedValue(new ProtocolException(400, { error: 'invalid_grant' }));
        expect(await oauthErr(ctl.token(body, req()))).toBe('invalid_grant');
        expect(tokenService.createAccessToken).not.toHaveBeenCalled();
      });
    });

    describe('refresh_token grant', () => {
      const body = { grant_type: 'refresh_token', client_id: 'c', refresh_token: 'RT' } as never;
      it('rotates and returns new tokens', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        const stored = { clientId: 'cid', userId: 'u1', scope: 's', user: { id: 'u1' } };
        tokenService.validateRefreshToken.mockResolvedValue(stored);
        const out = await ctl.token(body, req());
        expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith(stored);
        expect(out).toEqual({ access_token: 'AT', token_type: 'Bearer', expires_in: 900, refresh_token: 'RT2', scope: 's' });
      });
      it('requires refresh_token', async () => {
        const { ctl, clientService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        expect(await oauthErr(ctl.token({ grant_type: 'refresh_token', client_id: 'c' } as never, req()))).toBe('invalid_request');
      });
      it('rejects a token issued to another client and does not rotate it', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        tokenService.validateRefreshToken.mockResolvedValue({ clientId: 'other' });
        expect(await oauthErr(ctl.token(body, req()))).toBe('invalid_grant');
        expect(tokenService.rotateRefreshToken).not.toHaveBeenCalled();
      });
      it('surfaces reuse detection', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        tokenService.validateRefreshToken.mockRejectedValue(new ProtocolException(400, { error: 'invalid_grant' }));
        expect(await oauthErr(ctl.token(body, req()))).toBe('invalid_grant');
      });
    });

    describe('client_credentials grant', () => {
      it('issues M2M token with granted scopes and no refresh token', async () => {
        const { ctl, clientService, tokenService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        const out = await ctl.token({ grant_type: 'client_credentials', client_id: 'c', scope: 'a b' } as never, req());
        expect(tokenService.createAccessToken).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined, scope: 'a b' }));
        expect(out).toEqual({ access_token: 'AT', token_type: 'Bearer', expires_in: 900, scope: 'a b' });
      });
      it('handles absent scope', async () => {
        const { ctl, clientService } = setup();
        clientService.validateClient.mockResolvedValue(confidential);
        const out = await ctl.token({ grant_type: 'client_credentials', client_id: 'c' } as never, req());
        expect(out.scope).toBe('');
      });
      it('rejects public clients', async () => {
        const { ctl, clientService } = setup();
        clientService.validateClient.mockResolvedValue({ ...confidential, clientType: 'public' });
        expect(await oauthErr(ctl.token({ grant_type: 'client_credentials', client_id: 'c' } as never, req()))).toBe('unauthorized_client');
      });
    });
  });

  describe('userInfo', () => {
    it('maps JWT user to claims', async () => {
      const { ctl } = setup();
      const out = await ctl.userInfo(req({ user: { userId: 'u1', email: 'a@b.c', name: 'N', given_name: 'G', family_name: 'F', picture: 'p' } }));
      expect(out).toMatchObject({ sub: 'u1', email: 'a@b.c', name: 'N', given_name: 'G', family_name: 'F', picture: 'p', updated_at: Math.floor(NOW.getTime() / 1000) });
    });
    it('defaults missing email to empty string', async () => {
      const { ctl } = setup();
      expect((await ctl.userInfo(req({ user: { userId: 'u1' } }))).email).toBe('');
    });
  });

  describe('revoke', () => {
    it('revokes access token by default and refresh token by hint', async () => {
      const { ctl, tokenService } = setup();
      await ctl.revoke({ token: 'T' } as never);
      expect(tokenService.revokeAccessToken).toHaveBeenCalledWith('T');
      await ctl.revoke({ token: 'R', token_type_hint: 'refresh_token' } as never);
      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('R');
    });
    it('authenticates client when credentials are supplied; invalid -> invalid_client', async () => {
      const { ctl, clientService, tokenService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      await ctl.revoke({ token: 'T' } as never, basic('c', 's'));
      expect(clientService.validateClient).toHaveBeenCalledWith('c', 's');
      clientService.validateClient.mockRejectedValue(new Error('no'));
      tokenService.revokeAccessToken.mockClear();
      expect(await oauthErr(ctl.revoke({ token: 'T' } as never, basic('c', 'bad')))).toBe('invalid_client');
      expect(tokenService.revokeAccessToken).not.toHaveBeenCalled();
    });
    it('swallows revocation errors per RFC 7009', async () => {
      const { ctl, tokenService } = setup();
      tokenService.revokeAccessToken.mockRejectedValue(new Error('x'));
      await expect(ctl.revoke({ token: 'T' } as never)).resolves.toBeUndefined();
    });
  });

  describe('introspect', () => {
    it('requires client authentication', async () => {
      const { ctl, tokenService } = setup();
      expect(await oauthErr(ctl.introspect({ token: 'T' } as never))).toBe('invalid_client');
      expect(tokenService.introspectToken).not.toHaveBeenCalled();
    });
    it('returns introspection for an authenticated client; rejects bad creds', async () => {
      const { ctl, clientService, tokenService } = setup();
      clientService.validateClient.mockResolvedValue(confidential);
      await expect(ctl.introspect({ token: 'T', token_type_hint: 'access_token' } as never, basic('c', 's'))).resolves.toEqual({ active: true });
      expect(tokenService.introspectToken).toHaveBeenCalledWith('T', 'access_token');
      clientService.validateClient.mockRejectedValue(new ProtocolException(401, { error: 'invalid_client' }));
      tokenService.introspectToken.mockClear();
      await expect(ctl.introspect({ token: 'T' } as never, basic('c', 'bad'))).rejects.toBeInstanceOf(ProtocolException);
      expect(tokenService.introspectToken).not.toHaveBeenCalled();
    });
  });

  describe('discovery', () => {
    it('serves openid configuration and tenant jwks', async () => {
      const { ctl, jwks } = setup();
      expect(ctl.getOpenIDConfiguration().code_challenge_methods_supported).toEqual(['S256']);
      await expect(ctl.getJWKS(req({ tenantId: 't1' }))).resolves.toEqual({ keys: [{ kid: 'k' }] });
      expect(jwks.getVerificationKeys).toHaveBeenCalledWith('t1');
    });
  });

  describe('client management', () => {
    it('createClient stamps tenant + creator and returns secret once', async () => {
      const { ctl, clientService } = setup();
      clientService.createClient.mockResolvedValue({ client: { id: 'x' }, clientSecret: 'sec' });
      const out = await ctl.createClient({ name: 'n' } as never, req({ user: { sub: 'admin' } }));
      expect(clientService.createClient).toHaveBeenCalledWith({ tenantId: 't1', name: 'n', createdBy: 'admin' });
      expect(out).toMatchObject({ id: 'x', clientSecret: 'sec' });
    });
    it('createClient: body cannot override tenantId... (documents current behaviour)', async () => {
      const { ctl, clientService } = setup();
      clientService.createClient.mockResolvedValue({ client: {}, clientSecret: undefined });
      await ctl.createClient({ name: 'n' } as never, req());
      expect(clientService.createClient.mock.calls[0][0].tenantId).toBe('t1');
    });
    // BUG oauth.controller.ts createClient: `{ tenantId, ...dto }` lets a body-supplied tenantId override the request tenant.
    it('does not let the request body override tenantId', async () => {
      const { ctl, clientService } = setup();
      clientService.createClient.mockResolvedValue({ client: {}, clientSecret: undefined });
      await ctl.createClient({ name: 'n', tenantId: 'victim' } as never, req());
      expect(clientService.createClient.mock.calls[0][0].tenantId).toBe('t1');
    });
    it('listClients returns only active clients for tenant', async () => {
      const { ctl, clientService } = setup();
      clientService.listClients.mockResolvedValue({ clients: [1, 2], total: 2 });
      await expect(ctl.listClients(req())).resolves.toEqual([1, 2]);
      expect(clientService.listClients).toHaveBeenCalledWith('t1', { isActive: true });
    });
    it('get / update / delete / rotate delegate', async () => {
      const { ctl, clientService } = setup();
      clientService.getClientForTenant.mockResolvedValue({ id: 1 });
      await expect(ctl.getClient('c', { tenantId: 't1' } as never)).resolves.toEqual({ id: 1 });
      expect(clientService.getClientForTenant).toHaveBeenCalledWith('c', 't1');
      await expect(ctl.updateClient('c', { name: 'x' } as never, { tenantId: 't1' } as never)).resolves.toEqual({ message: 'Client updated successfully' });
      expect(clientService.updateClient).toHaveBeenCalledWith('c', 't1', { name: 'x' });
      await expect(ctl.deleteClient('c', { tenantId: 't1' } as never)).resolves.toBeUndefined();
      expect(clientService.deleteClient).toHaveBeenCalledWith('c', 't1');
      clientService.rotateClientSecret.mockResolvedValue({ clientSecret: 'n' });
      await expect(ctl.rotateClientSecret('c', { tenantId: 't1' } as never)).resolves.toEqual({ message: 'Client secret rotated successfully', clientSecret: 'n' });
    });
  });
});

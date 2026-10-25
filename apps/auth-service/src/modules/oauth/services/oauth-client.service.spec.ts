import { ApiException, ProtocolException } from '@/common/http';
import { PasswordService } from '@repo/security';
import { OAuthClientService } from './oauth-client.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function qb(result: unknown) {
  const b: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'addSelect', 'orderBy', 'take', 'skip']) b[m] = jest.fn(() => b);
  b.getOne = jest.fn().mockResolvedValue(result);
  b.getManyAndCount = jest.fn().mockResolvedValue(result);
  return b;
}

function setup() {
  const repo = {
    save: jest.fn(async (v: Record<string, unknown>) => v),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  return { svc: new OAuthClientService(repo as never, {} as never), repo };
}

const base = {
  tenantId: 't1',
  name: 'App',
  clientType: 'confidential' as const,
  grantTypes: ['authorization_code'],
  redirectUris: ['https://app.example.com/cb'],
};

const apiCode = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiException);
  return (e as ApiException).code;
};
const oauthCode = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ProtocolException);
  return (e as ProtocolException).body.error;
};

describe('OAuthClientService', () => {
  let hash: jest.SpyInstance;
  let verify: jest.SpyInstance;
  beforeEach(() => {
    hash = jest.spyOn(PasswordService, 'hash').mockImplementation(async (s: string) => `H(${s})`);
    verify = jest.spyOn(PasswordService, 'verify').mockImplementation(async (h: string, p: string) => h === `H(${p})`);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('createClient', () => {
    it('creates confidential client with hashed secret returned once and safe defaults', async () => {
      const { svc, repo } = setup();
      const { client, clientSecret } = await svc.createClient(base);
      expect(clientSecret).toBeDefined();
      const saved = repo.save.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(saved.clientSecretHash).toBe(`H(${clientSecret})`);
      expect(saved.clientSecretHash).not.toBe(clientSecret);
      expect(client.clientId).toMatch(/^client_[0-9a-f]{32}$/);
      expect(saved).toMatchObject({
        requirePkce: false,
        requireConsent: true,
        isFirstParty: false,
        accessTokenTtl: 900,
        refreshTokenTtl: 604800,
        idTokenTtl: 3600,
        authorizationCodeTtl: 600,
      });
    });

    it('public clients get no secret and forced PKCE even if requirePkce=false', async () => {
      const { svc, repo } = setup();
      const out = await svc.createClient({ ...base, clientType: 'public', requirePkce: false });
      expect(out.clientSecret).toBeUndefined();
      expect(hash).not.toHaveBeenCalled();
      expect(repo.save.mock.calls[0]?.[0]).toMatchObject({ requirePkce: true, clientSecretHash: undefined });
    });

    it('first-party gets sentry_ prefix and never requires consent', async () => {
      const { svc, repo } = setup();
      const { client } = await svc.createClient({ ...base, isFirstParty: true, requireConsent: true });
      expect(client.clientId).toMatch(/^sentry_/);
      expect((repo.save.mock.calls[0]?.[0] as { requireConsent?: boolean }).requireConsent).toBe(false);
    });

    it('honours explicit overrides', async () => {
      const { svc, repo } = setup();
      await svc.createClient({ ...base, requirePkce: true, requireConsent: false, accessTokenTtl: 60, refreshTokenTtl: 120, idTokenTtl: 30 });
      expect(repo.save.mock.calls[0]?.[0]).toMatchObject({ requirePkce: true, requireConsent: false, accessTokenTtl: 60, refreshTokenTtl: 120, idTokenTtl: 30 });
    });

    it('rejects invalid grant types', async () => {
      const { svc, repo } = setup();
      expect(await apiCode(svc.createClient({ ...base, grantTypes: ['implicit'] }))).toBe('VALIDATION_FAILED');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([[[]], [undefined]])('requires redirect URIs for authorization_code (%p)', async (uris) => {
      const { svc } = setup();
      expect(await apiCode(svc.createClient({ ...base, redirectUris: uris as never }))).toBe('VALIDATION_FAILED');
    });

    it.each(['http://evil.com/cb', 'not a url', 'javascript:alert(1)'])(
      'rejects insecure/invalid redirect URI %s',
      async (uri) => {
        const { svc } = setup();
        expect(await apiCode(svc.createClient({ ...base, redirectUris: [uri] }))).toBe('VALIDATION_FAILED');
      },
    );

    // BUG oauth-client.service.ts (createClient URI check): localhost exemption ignores scheme, so ftp://localhost is accepted.
    it('rejects non-http(s) schemes even on localhost', async () => {
      const { svc } = setup();
      expect(await apiCode(svc.createClient({ ...base, redirectUris: ['ftp://localhost/cb'] }))).toBe('VALIDATION_FAILED');
    });

    it.each([
      'file://localhost/etc/passwd',
      'data://localhost/x',
      'javascript://localhost/%0Aalert(1)',
      'https://x.com/cb#frag',
      'https://x.com/cb#',
      'https://user:pw@x.com/cb',
      'http://user@localhost/cb',
    ])('rejects unsafe redirect URI %s', async (uri) => {
      const { svc } = setup();
      expect(await apiCode(svc.createClient({ ...base, redirectUris: [uri] }))).toBe('VALIDATION_FAILED');
    });

    it.each(['http://localhost:3000/cb', 'http://127.0.0.1/cb', 'https://x.com/cb'])('allows %s', async (uri) => {
      const { svc } = setup();
      await expect(svc.createClient({ ...base, redirectUris: [uri] })).resolves.toBeDefined();
    });

    it('skips redirect validation for non-authorization_code grants', async () => {
      const { svc } = setup();
      await expect(
        svc.createClient({ ...base, grantTypes: ['client_credentials'], redirectUris: [] }),
      ).resolves.toBeDefined();
    });
  });

  describe('getClient / getClientWithSecret', () => {
    it('getClient returns active client; 404 otherwise', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValueOnce({ clientId: 'c' });
      await expect(svc.getClient('c')).resolves.toEqual({ clientId: 'c' });
      expect(repo.findOne.mock.calls[0]?.[0].where).toEqual({ clientId: 'c', isActive: true });
      repo.findOne.mockResolvedValueOnce(null);
      expect(await apiCode(svc.getClient('c'))).toBe('RESOURCE_NOT_FOUND');
    });

    it('getClientWithSecret selects the hash and filters active', async () => {
      const { svc, repo } = setup();
      const b = qb({ clientId: 'c' });
      repo.createQueryBuilder.mockReturnValue(b);
      await svc.getClientWithSecret('c');
      expect(b.addSelect).toHaveBeenCalledWith('client.clientSecretHash');
      expect(b.andWhere).toHaveBeenCalledWith('client.isActive = :isActive', { isActive: true });
      const b2 = qb(null);
      repo.createQueryBuilder.mockReturnValue(b2);
      expect(await apiCode(svc.getClientWithSecret('c'))).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('validateClient', () => {
    const withClient = (c: Record<string, unknown> | null) => {
      const s = setup();
      s.repo.createQueryBuilder.mockReturnValue(qb(c));
      return s.svc;
    };

    it('hides unknown/inactive clients as invalid_client (no enumeration)', async () => {
      expect(await oauthCode(withClient(null).validateClient('x', 's'))).toBe('invalid_client');
    });

    it('rethrows non-not-found errors from lookup', async () => {
      const s = setup();
      s.repo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });
      await expect(s.svc.validateClient('x')).rejects.toThrow('db down');
    });

    it('accepts public client without secret; rejects public with secret', async () => {
      const svc = withClient({ clientType: 'public' });
      await expect(svc.validateClient('c')).resolves.toMatchObject({ clientType: 'public' });
      expect(await oauthCode(svc.validateClient('c', 'sneaky'))).toBe('invalid_client');
    });

    it('confidential: requires secret, checks hash, rejects wrong secret', async () => {
      const svc = withClient({ clientType: 'confidential', clientSecretHash: 'H(good)' });
      await expect(svc.validateClient('c', 'good')).resolves.toBeDefined();
      expect(verify).toHaveBeenCalledWith('H(good)', 'good');
      expect(await oauthCode(svc.validateClient('c', 'bad'))).toBe('invalid_client');
      expect(await oauthCode(svc.validateClient('c'))).toBe('invalid_client');
    });

    it('confidential without stored hash is a hard error', async () => {
      await expect(withClient({ clientType: 'confidential' }).validateClient('c', 's')).rejects.toThrow(
        'Client secret hash missing',
      );
    });

    it('unknown client type is a hard error', async () => {
      await expect(withClient({ clientType: 'weird' }).validateClient('c', 's')).rejects.toThrow('Invalid client type');
    });
  });

  describe('validators', () => {
    const { svc } = setup();
    it('validateRedirectUri is exact match', async () => {
      const c = { redirectUris: ['https://a/cb'] } as never;
      await expect(svc.validateRedirectUri(c, 'https://a/cb')).resolves.toBe(true);
      expect(await oauthCode(svc.validateRedirectUri(c, 'https://a/cb/'))).toBe('invalid_request');
      expect(await oauthCode(svc.validateRedirectUri(c, 'https://a/cb?x=1'))).toBe('invalid_request');
    });
    it('validateGrantType', async () => {
      const c = { grantTypes: ['authorization_code'] } as never;
      await expect(svc.validateGrantType(c, 'authorization_code')).resolves.toBe(true);
      expect(await oauthCode(svc.validateGrantType(c, 'password'))).toBe('unauthorized_client');
    });
    it.each([
      ['no allowed scopes -> defaults', { allowedScopes: [], defaultScopes: ['d'] }, ['x'], ['d']],
      ['no allowed, no defaults -> empty', { allowedScopes: undefined }, ['x'], []],
      ['filters to allowed', { allowedScopes: ['a', 'b'], defaultScopes: ['d'] }, ['a', 'z'], ['a']],
      ['none valid -> defaults', { allowedScopes: ['a'], defaultScopes: ['d'] }, ['z'], ['d']],
      ['none valid, no defaults -> empty', { allowedScopes: ['a'] }, ['z'], []],
    ])('validateScopes: %s', async (_n, client, req, expected) => {
      await expect(svc.validateScopes(client as never, req)).resolves.toEqual(expected);
    });
  });

  describe('tenant scoping of admin operations', () => {
    it('looks clients up by clientId AND tenantId, so another tenant cannot touch them', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValueOnce(null);
      expect(await apiCode(svc.updateClient('c', 'other-tenant', { name: 'x' }))).toBe('RESOURCE_NOT_FOUND');
      expect(repo.findOne.mock.calls[0]?.[0].where).toEqual({ clientId: 'c', tenantId: 'other-tenant', isActive: true });
      expect(repo.save).not.toHaveBeenCalled();
    });
    it.each([
      ['rotateClientSecret', (svc: ReturnType<typeof setup>['svc']) => svc.rotateClientSecret('c', 'other-tenant')],
      ['deleteClient', (svc: ReturnType<typeof setup>['svc']) => svc.deleteClient('c', 'other-tenant')],
      ['getClientForTenant', (svc: ReturnType<typeof setup>['svc']) => svc.getClientForTenant('c', 'other-tenant')],
    ])('%s returns RESOURCE_NOT_FOUND for a client of another tenant', async (_n, call) => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValueOnce(null);
      expect(await apiCode(call(svc))).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('updateClient', () => {
    it('applies changes and saves', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ clientId: 'c', name: 'old' });
      const out = await svc.updateClient('c', 't1', { name: 'new', redirectUris: ['https://ok/cb'] });
      expect(out.name).toBe('new');
      expect(repo.save).toHaveBeenCalled();
    });
    it('rejects insecure/invalid redirect URIs without saving', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ clientId: 'c' });
      expect(await apiCode(svc.updateClient('c', 't1', { redirectUris: ['http://evil.com'] }))).toBe('VALIDATION_FAILED');
      expect(await apiCode(svc.updateClient('c', 't1', { redirectUris: ['%%%'] }))).toBe('VALIDATION_FAILED');
      expect(repo.save).not.toHaveBeenCalled();
    });
    it('updates without redirect uris', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ clientId: 'c' });
      await expect(svc.updateClient('c', 't1', { description: 'x' })).resolves.toMatchObject({ description: 'x' });
    });
  });

  describe('rotateClientSecret', () => {
    it('rotates secret for confidential clients', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ clientId: 'c', clientType: 'confidential', clientSecretHash: 'old' });
      const out = await svc.rotateClientSecret('c', 't1');
      expect(out.client.clientSecretHash).toBe(`H(${out.clientSecret})`);
      expect(out.clientSecret).not.toBe('old');
    });
    it('rejects public clients', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ clientId: 'c', clientType: 'public' });
      expect(await apiCode(svc.rotateClientSecret('c', 't1'))).toBe('BAD_REQUEST');
    });
  });

  it('deleteClient soft-deletes', async () => {
    const { svc, repo } = setup();
    const row = { clientId: 'c', isActive: true };
    repo.findOne.mockResolvedValue(row);
    await svc.deleteClient('c', 't1');
    expect(row.isActive).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(row);
  });

  describe('listClients', () => {
    it('applies tenant filter only by default', async () => {
      const { svc, repo } = setup();
      const b = qb([[{ id: 1 }], 1]);
      repo.createQueryBuilder.mockReturnValue(b);
      await expect(svc.listClients('t1')).resolves.toEqual({ clients: [{ id: 1 }], total: 1 });
      expect(b.andWhere).not.toHaveBeenCalled();
      expect(b.take).not.toHaveBeenCalled();
    });
    it('applies all filters and paging; false filters still apply', async () => {
      const { svc, repo } = setup();
      const b = qb([[], 0]);
      repo.createQueryBuilder.mockReturnValue(b);
      await svc.listClients('t1', { isActive: false, isFirstParty: false, limit: 5, offset: 10 });
      expect(b.andWhere).toHaveBeenCalledTimes(2);
      expect(b.take).toHaveBeenCalledWith(5);
      expect(b.skip).toHaveBeenCalledWith(10);
    });
  });
});

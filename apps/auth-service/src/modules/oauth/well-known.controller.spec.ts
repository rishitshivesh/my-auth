import { WellKnownController } from './well-known.controller';
import { buildOpenIdConfiguration } from './openid-configuration';

const cfg = (values: Record<string, string>) => ({
  get: jest.fn((k: string, d?: string) => values[k] ?? d),
});

describe('WellKnownController', () => {
  it('jwks wraps verification keys', async () => {
    const jwks = { getVerificationKeys: jest.fn().mockResolvedValue([{ kid: 'k1' }]) };
    const c = new WellKnownController(jwks as never, cfg({}) as never);
    await expect(c.jwks()).resolves.toEqual({ keys: [{ kid: 'k1' }] });
  });

  it('jwks propagates key-store failures', async () => {
    const jwks = { getVerificationKeys: jest.fn().mockRejectedValue(new Error('x')) };
    const c = new WellKnownController(jwks as never, cfg({}) as never);
    await expect(c.jwks()).rejects.toThrow('x');
  });

  it('openIdConfiguration builds the document from config', () => {
    const c = new WellKnownController({} as never, cfg({ JWT_ISSUER: 'https://iss', ISSUER_BASE_URL: 'https://base/' }) as never);
    const doc = c.openIdConfiguration();
    expect(doc.issuer).toBe('https://iss');
    expect(doc.jwks_uri).toBe('https://base/.well-known/jwks.json');
  });
});

describe('buildOpenIdConfiguration', () => {
  it('defaults issuer and roots endpoints at the issuer when no base url', () => {
    const doc = buildOpenIdConfiguration(cfg({}) as never);
    expect(doc.issuer).toBe('https://sentry.scrolloop.com');
    expect(doc.token_endpoint).toBe('https://sentry.scrolloop.com/oauth/token');
  });
  it('trims trailing slashes on base url', () => {
    const doc = buildOpenIdConfiguration(cfg({ ISSUER_BASE_URL: 'https://b.example///' }) as never);
    expect(doc.authorization_endpoint).toBe('https://b.example/oauth/authorize');
    expect(doc.userinfo_endpoint).toBe('https://b.example/oauth/userinfo');
    expect(doc.revocation_endpoint).toBe('https://b.example/oauth/revoke');
    expect(doc.introspection_endpoint).toBe('https://b.example/oauth/introspect');
  });
  it('advertises only S256 PKCE, code flow, RS256 (no plain/implicit)', () => {
    const doc = buildOpenIdConfiguration(cfg({}) as never);
    expect(doc.code_challenge_methods_supported).toEqual(['S256']);
    expect(doc.response_types_supported).toEqual(['code']);
    expect(doc.id_token_signing_alg_values_supported).toEqual(['RS256']);
    expect(doc.grant_types_supported).not.toContain('password');
  });
});

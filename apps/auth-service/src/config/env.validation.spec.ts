import { validationSchema } from './env.validation';

const KEY_44 = Buffer.alloc(32, 7).toString('base64');
const SECRET_32 = 'x'.repeat(32);
const TOKEN_KEY = 'a'.repeat(64);

const baseEnv = (): Record<string, unknown> => ({
  ISSUER_BASE_URL: 'https://sentry.example.com',
  FRONTEND_URL: 'https://app.example.com',
  CORS_ORIGINS: 'https://app.example.com',
  JWT_SECRET: SECRET_32,
  KEYRING_MASTER_KEY: KEY_44,
  SESSION_SECRET: SECRET_32,
  DB_URL: 'postgres://u:p@localhost:5432/db',
});

const validate = (env: Record<string, unknown>) => validationSchema.validate(env);

describe('env validation schema', () => {
  it('defaults LDAP_ALLOWED_PRIVATE_CIDRS to empty and rejects malformed CIDRs', () => {
    expect(validate(baseEnv()).value.LDAP_ALLOWED_PRIVATE_CIDRS).toBe('');
    expect(validate({ ...baseEnv(), LDAP_ALLOWED_PRIVATE_CIDRS: '10.0.0.0/8, 192.168.0.0/16' }).error).toBeUndefined();
    const { error } = validate({ ...baseEnv(), LDAP_ALLOWED_PRIVATE_CIDRS: '10.0.0.0/99' });
    expect(error?.message).toMatch(/LDAP_ALLOWED_PRIVATE_CIDRS/);
  });

  it('accepts a minimal valid env and applies defaults', () => {
    const { error, value } = validate(baseEnv());
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(4000);
    expect(value.KEY_ACTIVE_TTL_DAYS).toBe(90);
    expect(value.KEY_ROTATION_GRACE_DAYS).toBe(7);
    expect(value.SESSION_TTL).toBe(604800);
    expect(value.DISABLE_RATE_LIMIT).toBe('false');
  });

  it('allows unknown variables', () => {
    expect(validate({ ...baseEnv(), SOMETHING_ELSE: 'x' }).error).toBeUndefined();
  });

  it.each(['ISSUER_BASE_URL', 'FRONTEND_URL', 'CORS_ORIGINS', 'JWT_SECRET', 'KEYRING_MASTER_KEY', 'SESSION_SECRET'])(
    'rejects when %s is missing',
    (key) => {
      const env = baseEnv();
      delete env[key];
      const { error } = validate(env);
      expect(error?.message).toContain(key);
    },
  );

  it('rejects when no database setting is provided', () => {
    const env = baseEnv();
    delete env.DB_URL;
    expect(validate(env).error?.message).toContain('Database connection not configured');
  });

  it.each([
    ['DATABASE_URL', 'postgresql://u:p@h/db'],
    ['DATABASE_HOST', 'db.local'],
  ])('accepts %s as a DB source', (key, val) => {
    const env = baseEnv();
    delete env.DB_URL;
    env[key] = val;
    expect(validate(env).error).toBeUndefined();
  });

  it('rejects non-postgres DB_URL scheme', () => {
    expect(validate({ ...baseEnv(), DB_URL: 'mysql://u:p@h/db' }).error).toBeDefined();
  });

  it('rejects short secrets (boundary 31 vs 32)', () => {
    expect(validate({ ...baseEnv(), JWT_SECRET: 'x'.repeat(31) }).error).toBeDefined();
    expect(validate({ ...baseEnv(), SESSION_SECRET: 'x'.repeat(31) }).error).toBeDefined();
    expect(validate({ ...baseEnv(), JWT_SECRET: 'x'.repeat(32) }).error).toBeUndefined();
  });

  it('rejects keyring master key that is not 44-char base64', () => {
    expect(validate({ ...baseEnv(), KEYRING_MASTER_KEY: 'short' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), KEYRING_MASTER_KEY: '!'.repeat(44) }).error).toBeDefined();
  });

  it('rejects non-http URLs for public URLs', () => {
    expect(validate({ ...baseEnv(), ISSUER_BASE_URL: 'ftp://x.com' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), FRONTEND_URL: 'not a url' }).error).toBeDefined();
  });

  it('rejects invalid NODE_ENV and out-of-range PORT', () => {
    expect(validate({ ...baseEnv(), NODE_ENV: 'staging' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), PORT: 70000 }).error).toBeDefined();
    expect(validate({ ...baseEnv(), PORT: 65535 }).error).toBeUndefined();
  });

  describe('TOKEN_ENCRYPTION_KEY', () => {
    it('is required in production', () => {
      expect(validate({ ...baseEnv(), NODE_ENV: 'production' }).error?.message).toContain('TOKEN_ENCRYPTION_KEY');
    });
    it('accepts a 64-hex key in production', () => {
      expect(validate({ ...baseEnv(), NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: TOKEN_KEY }).error).toBeUndefined();
    });
    it('rejects non-hex / wrong length in production', () => {
      expect(validate({ ...baseEnv(), NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: 'g'.repeat(64) }).error).toBeDefined();
      expect(validate({ ...baseEnv(), NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: 'a'.repeat(63) }).error).toBeDefined();
    });
    it('is optional (and may be empty) outside production', () => {
      expect(validate({ ...baseEnv(), NODE_ENV: 'development' }).error).toBeUndefined();
      expect(validate({ ...baseEnv(), NODE_ENV: 'test', TOKEN_ENCRYPTION_KEY: '' }).error).toBeUndefined();
    });
  });

  it('enforces numeric minimums', () => {
    expect(validate({ ...baseEnv(), SESSION_TTL: 299 }).error).toBeDefined();
    expect(validate({ ...baseEnv(), SESSION_TTL: 300 }).error).toBeUndefined();
    expect(validate({ ...baseEnv(), RECENT_AUTH_WINDOW_SECONDS: 29 }).error).toBeDefined();
    expect(validate({ ...baseEnv(), LOGIN_THROTTLE_EMAIL_LIMIT: 0 }).error).toBeDefined();
    expect(validate({ ...baseEnv(), KEY_ACTIVE_TTL_DAYS: 0 }).error).toBeDefined();
  });

  it('validates boolean-ish strings', () => {
    expect(validate({ ...baseEnv(), DB_SSL: 'yes' }).error).toBeUndefined();
    expect(validate({ ...baseEnv(), DB_SSL: 'maybe' }).error).toBeDefined();
  });

  it('validates platform slug pattern and seed password length', () => {
    expect(validate({ ...baseEnv(), SENTRY_PLATFORM_SLUG: 'Bad_Slug' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), SEED_SUPERADMIN_PASSWORD: 'short' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), SEED_SUPERADMIN_PASSWORD: 'long-enough-12' }).error).toBeUndefined();
  });

  it('validates email fields', () => {
    expect(validate({ ...baseEnv(), EMAIL_FROM: 'nope' }).error).toBeDefined();
    expect(validate({ ...baseEnv(), SUPPORT_EMAIL: '' }).error).toBeUndefined();
  });
});

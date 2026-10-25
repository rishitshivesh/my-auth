import * as crypto from 'crypto';
import { JwksService } from './jwks.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const MASTER_KEY = '0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const FIVE_MIN = 5 * 60 * 1000;

interface Row {
  kid: string;
  tenantId: string | null;
  status: string;
  algorithm: string;
  publicKeyPem: string;
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  createdAt: Date;
  retiredAt?: Date;
}

function setup(seed: Row[] = []) {
  const rows = [...seed];
  const repo = {
    findOne: jest.fn(async (_q?: { where: { tenantId?: unknown } }): Promise<Row | null> => null),
    find: jest.fn(async (_q?: { where: unknown[] }) => [] as Row[]),
    create: jest.fn((e: Partial<Row>) => ({ ...e, algorithm: 'RS256', createdAt: new Date() }) as Row),
    save: jest.fn(async (e: Row) => {
      rows.push(e);
      return e;
    }),
    delete: jest.fn(),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(MASTER_KEY), get: jest.fn((_k: string, d: unknown) => d) };
  const svc = new JwksService(repo as never, config as never);
  return { svc, repo, rows };
}

/** Creates a real stored platform key via the service itself, returning the saved row. */
async function makeRow(tenantId: string | null): Promise<Row> {
  const { svc, repo } = setup();
  repo.findOne.mockResolvedValue(null);
  await (svc as unknown as { generateAndStoreKeyPair(t: string | null): Promise<Row> }).generateAndStoreKeyPair(tenantId);
  return repo.save.mock.calls[0]?.[0] as Row;
}

describe('JwksService (extra)', () => {
  let platformRow: Row;
  let tenantRow: Row;
  beforeAll(async () => {
    platformRow = { ...(await makeRow(null)), status: 'active', createdAt: NOW };
    tenantRow = { ...(await makeRow('t1')), status: 'active', createdAt: NOW };
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('onModuleInit loads an existing platform key without generating a new one', async () => {
    const { svc, repo } = setup();
    repo.findOne.mockResolvedValue(platformRow);
    await svc.onModuleInit();
    expect(repo.save).not.toHaveBeenCalled();
    await expect(svc.getCurrentSigningKey()).resolves.toMatchObject({ kid: platformRow.kid });
    expect(repo.findOne).toHaveBeenCalledTimes(1); // served from fresh cache
  });

  it('private keys are never stored in plaintext', () => {
    expect(platformRow.encryptedPrivateKey).not.toContain('PRIVATE KEY');
    expect(platformRow.authTag).toBeTruthy();
  });

  describe('getCurrentSigningKey', () => {
    it('fresh cache hit does not touch the DB; stale cache with same kid only refreshes timestamp', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(platformRow);
      await svc.onModuleInit();
      repo.findOne.mockClear();
      jest.setSystemTime(NOW.getTime() + FIVE_MIN + 1);
      const k = await svc.getCurrentSigningKey();
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(k.kid).toBe(platformRow.kid);
      await svc.getCurrentSigningKey();
      expect(repo.findOne).toHaveBeenCalledTimes(1); // timestamp refreshed
    });

    it('loads and caches a tenant key', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(tenantRow);
      const k = await svc.getCurrentSigningKey('t1');
      expect(k.kid).toBe(tenantRow.kid);
      expect(k.privateKey.type).toBe('private');
      repo.findOne.mockClear();
      await svc.getCurrentSigningKey('t1');
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('falls back to the platform key when tenant has none', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockImplementation(async (q) =>
        typeof q?.where.tenantId === 'string' ? null : platformRow,
      );
      const k = await svc.getCurrentSigningKey('t-new');
      expect(k.kid).toBe(platformRow.kid);
    });

    it('throws when no platform key exists', async () => {
      const { svc } = setup();
      await expect(svc.getCurrentSigningKey()).rejects.toThrow('No active platform signing key found');
    });

    it('rejects when the stored key cannot be decrypted (wrong master key)', async () => {
      const { svc, repo } = setup();
      (svc as unknown as { configService: { getOrThrow: jest.Mock } }).configService.getOrThrow.mockReturnValue('f'.repeat(32));
      repo.findOne.mockResolvedValue(platformRow);
      await expect(svc.getCurrentSigningKey()).rejects.toBeDefined();
    });
  });

  describe('verification keys', () => {
    it('getVerificationKeys returns platform keys only when no tenant', async () => {
      const { svc, repo } = setup();
      repo.find.mockResolvedValue([platformRow]);
      const keys = await svc.getVerificationKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', kid: platformRow.kid });
      expect(keys[0]).not.toHaveProperty('d');
      expect(repo.find.mock.calls[0]?.[0]?.where).toHaveLength(1);
    });
    it('getVerificationKeys adds tenant clause when tenant given', async () => {
      const { svc, repo } = setup();
      await svc.getVerificationKeys('t1');
      expect(repo.find.mock.calls[0]?.[0]?.where).toHaveLength(2);
    });
    it('getVerificationKeyByKid returns null for unknown / revoked', async () => {
      const { svc } = setup();
      await expect(svc.getVerificationKeyByKid('nope')).resolves.toBeNull();
    });
  });

  describe('rotateKey', () => {
    it('retires the old key, creates a new active one and primes cache', async () => {
      const { svc, repo } = setup();
      const old = { ...platformRow };
      repo.findOne.mockResolvedValue(old);
      await svc.rotateKey();
      expect(old.status).toBe('retired');
      expect(old.retiredAt).toEqual(NOW);
      const newRow = repo.save.mock.calls[1]?.[0] as Row;
      expect(newRow.status).toBe('active');
      expect(newRow.kid).not.toBe(old.kid);
      repo.findOne.mockClear();
      await expect(svc.getCurrentSigningKey()).resolves.toMatchObject({ kid: newRow.kid });
      expect(repo.findOne).not.toHaveBeenCalled();
    });
    it('works for a tenant with no previous key', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(null);
      await svc.rotateKey('t9');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect((repo.save.mock.calls[0]?.[0] as Row).tenantId).toBe('t9');
    });
  });

  it('deleteTenantKeys deletes rows and evicts cache', async () => {
    const { svc, repo } = setup();
    repo.findOne.mockResolvedValue(tenantRow);
    await svc.getCurrentSigningKey('t1');
    await svc.deleteTenantKeys('t1');
    expect(repo.delete).toHaveBeenCalledWith({ tenantId: 't1' });
    repo.findOne.mockClear();
    repo.findOne.mockResolvedValue(tenantRow);
    await svc.getCurrentSigningKey('t1');
    expect(repo.findOne).toHaveBeenCalled();
  });

  describe('getPublicKeyForToken', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    it('rejects malformed tokens', async () => {
      const { svc } = setup();
      await expect(svc.getPublicKeyForToken('a.b')).rejects.toThrow('Invalid token format');
      await expect(svc.getPublicKeyForToken('a.b.c.d')).rejects.toThrow('Invalid token format');
    });
    it('rejects missing kid (alg-confusion style header)', async () => {
      const { svc } = setup();
      await expect(svc.getPublicKeyForToken(`${b64({ alg: 'none' })}.x.y`)).rejects.toThrow('Token missing kid header');
    });
    it('rejects unknown kid', async () => {
      const { svc } = setup();
      await expect(svc.getPublicKeyForToken(`${b64({ kid: 'zzz' })}.x.y`)).rejects.toThrow('Signing key not found for kid: zzz');
    });
    it('rejects non-JSON header', async () => {
      const { svc } = setup();
      await expect(svc.getPublicKeyForToken('@@@.x.y')).rejects.toBeDefined();
    });
    it('returns a verifying public key for a known kid', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(platformRow);
      const key = await svc.getPublicKeyForToken(`${b64({ kid: platformRow.kid })}.x.y`);
      expect(key.type).toBe('public');
      expect(key.asymmetricKeyType).toBe('rsa');
    });
  });

  it('revokeExpiredRetiredKeys returns 0 when affected is undefined', async () => {
    const { svc, repo } = setup();
    const b: Record<string, jest.Mock> = {};
    for (const m of ['update', 'set', 'where', 'andWhere']) b[m] = jest.fn(() => b);
    b.execute = jest.fn().mockResolvedValue({});
    (repo as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder = jest.fn(() => b);
    await expect(svc.revokeExpiredRetiredKeys(7)).resolves.toBe(0);
    expect(crypto).toBeDefined();
  });
});

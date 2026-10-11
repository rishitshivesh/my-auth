import * as crypto from "crypto";
import { JwksService } from "./jwks.service";
import { Repository } from "typeorm";
import { KeyPair } from "@repo/database";
import { ConfigService } from "@nestjs/config";
import { EncryptionService } from "@repo/security";

const MASTER_KEY = "0123456789abcdef0123456789abcdef";

function makeConfig(): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(MASTER_KEY),
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;
}

function generateTestKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    publicKeyPem: publicKey as string,
    privateKeyPem: privateKey as string,
  };
}

describe("JwksService", () => {
  describe("toJWK", () => {
    it("converts a PEM public key to JWK format with correct fields", () => {
      const { publicKeyPem } = generateTestKeyPair();
      const mockRepo = {} as Repository<KeyPair>;
      const mockConfig = {
        getOrThrow: jest.fn().mockReturnValue(MASTER_KEY),
      } as unknown as ConfigService;

      const service = new JwksService(mockRepo, mockConfig);
      const jwk = service.toJWK(publicKeyPem, "test-kid-1");

      expect(jwk.kty).toBe("RSA");
      expect(jwk.use).toBe("sig");
      expect(jwk.alg).toBe("RS256");
      expect(jwk.kid).toBe("test-kid-1");
      expect(typeof jwk.n).toBe("string");
      expect(jwk.n.length).toBeGreaterThan(0);
      expect(typeof jwk.e).toBe("string");
      expect(jwk.e).toBe("AQAB");
    });

    it("produces a JWK whose public key matches the original PEM", () => {
      const { publicKeyPem } = generateTestKeyPair();
      const mockRepo = {} as Repository<KeyPair>;
      const mockConfig = {
        getOrThrow: jest.fn().mockReturnValue(MASTER_KEY),
      } as unknown as ConfigService;

      const service = new JwksService(mockRepo, mockConfig);
      const jwk = service.toJWK(publicKeyPem, "test-kid-2");

      const reconstructed = crypto.createPublicKey({ key: jwk as any, format: "jwk" });
      const reconstructedPem = reconstructed.export({
        type: "spki",
        format: "pem",
      });
      expect(reconstructedPem).toBe(publicKeyPem);
    });
  });

  describe("onModuleInit (first boot)", () => {
    it("generates exactly one platform key, encrypted at rest, and can sign with it", async () => {
      const saved: Partial<KeyPair>[] = [];
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((entity: Partial<KeyPair>) => entity),
        save: jest.fn(async (entity: Partial<KeyPair>) => {
          saved.push(entity);
          return entity;
        }),
      } as unknown as Repository<KeyPair>;
      const config = makeConfig();

      const service = new JwksService(repo, config);
      await service.onModuleInit();

      expect(saved).toHaveLength(1);
      const stored = saved[0]!;
      expect(stored.tenantId).toBeNull();
      expect(stored.status).toBe("active");
      expect(stored.encryptedPrivateKey).not.toContain("PRIVATE KEY");

      const { kid, privateKey } = await service.getCurrentSigningKey();
      expect(kid).toBe(stored.kid);
      const signature = crypto.sign("sha256", Buffer.from("payload"), privateKey);
      const verified = crypto.verify(
        "sha256",
        Buffer.from("payload"),
        crypto.createPublicKey(stored.publicKeyPem as string),
        signature,
      );
      expect(verified).toBe(true);
    });
  });

  describe("ensureTenantKeyExists", () => {
    it("provisions a key when the tenant has none", async () => {
      const saved: Partial<KeyPair>[] = [];
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((entity: Partial<KeyPair>) => entity),
        save: jest.fn(async (entity: Partial<KeyPair>) => {
          saved.push(entity);
          return entity;
        }),
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      await service.ensureTenantKeyExists("tenant-1");

      expect(saved).toHaveLength(1);
      expect(saved[0]!.tenantId).toBe("tenant-1");
      expect(saved[0]!.status).toBe("active");
    });

    it("is a no-op when the tenant already has an active key", async () => {
      const save = jest.fn();
      const repo = {
        findOne: jest.fn().mockResolvedValue({ id: "kp-1", tenantId: "tenant-1", status: "active" }),
        save,
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      await service.ensureTenantKeyExists("tenant-1");

      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("rotateIfDue", () => {
    it("backfills a key when the tenant has none at all", async () => {
      const saved: Partial<KeyPair>[] = [];
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((entity: Partial<KeyPair>) => entity),
        save: jest.fn(async (entity: Partial<KeyPair>) => {
          saved.push(entity);
          return entity;
        }),
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      await service.rotateIfDue("tenant-1", 90);

      expect(saved).toHaveLength(1);
      expect(saved[0]!.tenantId).toBe("tenant-1");
    });

    it("does not rotate a key that is within its TTL", async () => {
      const activeKey = {
        id: "kp-1",
        tenantId: "tenant-1",
        status: "active",
        createdAt: new Date(), // just created
      };
      const save = jest.fn();
      const repo = {
        findOne: jest.fn().mockResolvedValue(activeKey),
        save,
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      await service.rotateIfDue("tenant-1", 90);

      expect(save).not.toHaveBeenCalled();
    });

    it("retires the active key and generates a new one once past its TTL", async () => {
      const activeKey: Partial<KeyPair> = {
        id: "kp-1",
        kid: "old-kid",
        tenantId: "tenant-1",
        status: "active",
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000), // 91 days old
      };
      const saved: Partial<KeyPair>[] = [];
      const repo = {
        findOne: jest.fn().mockResolvedValue(activeKey),
        create: jest.fn((entity: Partial<KeyPair>) => entity),
        save: jest.fn(async (entity: Partial<KeyPair>) => {
          saved.push({ ...entity });
          return entity;
        }),
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      await service.rotateIfDue("tenant-1", 90);

      // First save retires the old key, second save stores the new one.
      expect(saved).toHaveLength(2);
      expect(saved[0]!.id).toBe("kp-1");
      expect(saved[0]!.status).toBe("retired");
      expect(saved[1]!.tenantId).toBe("tenant-1");
      expect(saved[1]!.status).toBe("active");
      expect(saved[1]!.kid).not.toBe("old-kid");
    });
  });

  describe("revokeExpiredRetiredKeys", () => {
    it("revokes only retired keys past the grace cutoff", async () => {
      const execute = jest.fn().mockResolvedValue({ affected: 2 });
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute,
      };
      const repo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());
      const count = await service.revokeExpiredRetiredKeys(7);

      expect(qb.set).toHaveBeenCalledWith({ status: "revoked" });
      expect(qb.where).toHaveBeenCalledWith("status = :status", { status: "retired" });
      expect(count).toBe(2);
    });
  });

  describe("getCurrentSigningKey cache staleness (cross-replica rotation)", () => {
    it("picks up a rotation performed by another replica once the cache goes stale", async () => {
      const { privateKeyPem: oldPriv } = generateTestKeyPair();
      const { privateKeyPem: newPriv } = generateTestKeyPair();
      const oldKeyRow = {
        kid: "old-kid",
        tenantId: "tenant-1",
        algorithm: "RS256",
        encryptedPrivateKey: oldPriv,
        iv: "iv",
        authTag: "",
      } as KeyPair;
      const newKeyRow = {
        kid: "new-kid",
        tenantId: "tenant-1",
        algorithm: "RS256",
        encryptedPrivateKey: newPriv,
        iv: "iv",
        authTag: "",
      } as KeyPair;

      let activeRow = oldKeyRow;
      const repo = {
        findOne: jest.fn().mockImplementation(() => Promise.resolve(activeRow)),
      } as unknown as Repository<KeyPair>;

      const decryptSpy = jest
        .spyOn(EncryptionService, "decrypt")
        .mockImplementation((payload: unknown) => {
          const encrypted = (payload as { encrypted: string }).encrypted;
          return Promise.resolve(encrypted === oldPriv ? oldPriv : newPriv);
        });

      const nowSpy = jest.spyOn(Date, "now");
      const t0 = 1_000_000;
      nowSpy.mockReturnValue(t0);

      const service = new JwksService(repo, makeConfig());

      const first = await service.getCurrentSigningKey("tenant-1");
      expect(first.kid).toBe("old-kid");

      // Another replica rotates this tenant's key — the DB now shows a
      // different active kid, but this replica's cache doesn't know yet.
      activeRow = newKeyRow;

      // Still within the freshness window — must keep returning the
      // cached (now-stale) key without hitting the DB again.
      nowSpy.mockReturnValue(t0 + 60 * 1000); // +1 minute
      const stillCached = await service.getCurrentSigningKey("tenant-1");
      expect(stillCached.kid).toBe("old-kid");

      // Past the freshness window — must re-check the DB and pick up the
      // rotation instead of continuing to sign with the retired key.
      nowSpy.mockReturnValue(t0 + 6 * 60 * 1000); // +6 minutes
      const refreshed = await service.getCurrentSigningKey("tenant-1");
      expect(refreshed.kid).toBe("new-kid");

      nowSpy.mockRestore();
      decryptSpy.mockRestore();
    });
  });

  describe("rotation grace period (AC: tokens signed before rotation still verify during grace)", () => {
    it("keeps a retired key verifiable until it's explicitly revoked past the grace window", async () => {
      const { publicKeyPem: oldPub, privateKeyPem: oldPriv } = generateTestKeyPair();
      const oldKey: KeyPair = {
        id: "kp-old",
        kid: "old-kid",
        tenantId: null,
        algorithm: "RS256",
        use: "sig",
        publicKeyPem: oldPub,
        encryptedPrivateKey: oldPriv,
        iv: "iv",
        authTag: "",
        status: "retired", // already rotated out, still within grace
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 1000),
        retiredAt: new Date(), // retired just now — well within grace
        revokedAt: null,
      } as KeyPair;

      const repo = {
        findOne: jest.fn((opts: { where: { kid?: string; status?: unknown } }) =>
          opts.where.kid === "old-kid" ? Promise.resolve(oldKey) : Promise.resolve(null),
        ),
      } as unknown as Repository<KeyPair>;

      const service = new JwksService(repo, makeConfig());

      // Still verifiable: a token signed before rotation keeps working.
      const jwk = await service.getVerificationKeyByKid("old-kid");
      expect(jwk).not.toBeNull();
      expect(jwk!.kid).toBe("old-kid");
    });
  });
});

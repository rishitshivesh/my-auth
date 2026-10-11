import * as crypto from "crypto";
import { JwksService } from "./jwks.service";
import { Repository } from "typeorm";
import { KeyPair } from "@repo/database";
import { ConfigService } from "@nestjs/config";
import { EncryptionService } from "@repo/security";

const MASTER_KEY = "0123456789abcdef0123456789abcdef";

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

  describe("getJWKS (sync, from in-memory key)", () => {
    it("returns a JWKS with one key after platform key is loaded", async () => {
      const { publicKeyPem, privateKeyPem } = generateTestKeyPair();

      const mockKeyPair: Partial<KeyPair> = {
        kid: "platform-kid",
        tenantId: null,
        algorithm: "RS256",
        use: "sig",
        publicKeyPem,
        encryptedPrivateKey: "encrypted-placeholder",
        iv: "aabbccddeeff0011aabbccdd",
        authTag: "aabbccddeeff00112233445566778899",
        status: "active",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        retiredAt: null,
        revokedAt: null,
      };

      const mockRepo = {
        findOne: jest.fn().mockResolvedValue(mockKeyPair),
        find: jest.fn().mockResolvedValue([mockKeyPair]),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as Repository<KeyPair>;

      const mockConfig = {
        getOrThrow: jest.fn().mockReturnValue(MASTER_KEY),
      } as unknown as ConfigService;

      // Spy on the static decrypt so the real AES-GCM path is never hit
      const decryptSpy = jest
        .spyOn(EncryptionService, 'decrypt')
        .mockResolvedValue(privateKeyPem);

      try {
        const service = new JwksService(mockRepo, mockConfig);
        await service.onModuleInit();

        const jwks = service.getJWKS();
        expect(jwks.keys).toHaveLength(1);
        expect(jwks.keys[0]?.kid).toBe("platform-kid");
        expect(jwks.keys[0]?.kty).toBe("RSA");
        expect(jwks.keys[0]?.alg).toBe("RS256");
        expect(jwks.keys[0]?.e).toBe("AQAB");
      } finally {
        decryptSpy.mockRestore();
      }
    });
  });
});

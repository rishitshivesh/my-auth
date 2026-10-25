import { ConfigService } from "@nestjs/config";
import { TokenEncryptionService } from "./oauth-token-encryption.service";

const KEY = "ab".repeat(32);

function build(key: string | undefined = KEY): TokenEncryptionService {
  const config = { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
  return new TokenEncryptionService(config);
}

describe("TokenEncryptionService", () => {
  describe("constructor", () => {
    it("throws when the key is not configured", () => {
      expect(() => build("")).toThrow("TOKEN_ENCRYPTION_KEY not configured");
    });

    it("throws when the key is not 32 bytes", () => {
      expect(() => build("abcd")).toThrow(/32 bytes/);
      expect(() => build("ab".repeat(31))).toThrow(/32 bytes/);
      expect(() => build("ab".repeat(33))).toThrow(/32 bytes/);
    });

    it("accepts a 64-hex-char key", () => {
      expect(() => build()).not.toThrow();
    });
  });

  describe("encrypt/decrypt", () => {
    it("round-trips unicode and long plaintext", () => {
      const svc = build();
      for (const p of ["token", "päss🔐wörd", "x".repeat(10_000)]) {
        expect(svc.decrypt(svc.encrypt(p))).toBe(p);
      }
    });

    it("emits iv:authTag:ciphertext with 16-byte iv and tag", () => {
      const [iv, tag, data] = build().encrypt("hello").split(":");
      expect(iv).toHaveLength(32);
      expect(tag).toHaveLength(32);
      expect(data!.length).toBeGreaterThan(0);
    });

    it("never repeats a nonce and yields different ciphertext for equal plaintext", () => {
      const svc = build();
      const outs = Array.from({ length: 200 }, () => svc.encrypt("same"));
      expect(new Set(outs.map((o) => o.split(":")[0])).size).toBe(200);
      expect(new Set(outs).size).toBe(200);
    });

    it("does not leak plaintext in ciphertext", () => {
      expect(build().encrypt("supersecrettoken")).not.toContain("supersecrettoken");
    });

    it("rejects empty plaintext and empty ciphertext", () => {
      const svc = build();
      expect(() => svc.encrypt("")).toThrow("Cannot encrypt empty token");
      expect(() => svc.decrypt("")).toThrow("Cannot decrypt empty data");
    });

    it("detects tampering of ciphertext, tag and iv", () => {
      const svc = build();
      const [iv, tag, data] = svc.encrypt("hello world").split(":") as [string, string, string];
      const flip = (h: string) => (h[0] === "0" ? "1" : "0") + h.slice(1);
      expect(() => svc.decrypt(`${iv}:${tag}:${flip(data)}`)).toThrow("Token decryption failed");
      expect(() => svc.decrypt(`${iv}:${flip(tag)}:${data}`)).toThrow("Token decryption failed");
      expect(() => svc.decrypt(`${flip(iv)}:${tag}:${data}`)).toThrow("Token decryption failed");
    });

    // TODO(bug): decrypt() does not enforce a 16-byte auth tag, so Node accepts
    // truncated GCM tags (weakens forgery resistance). Fix: createDecipheriv(..., { authTagLength: 16 }).
    it("rejects truncated auth tags", () => {
      const svc = build();
      const [iv, tag, data] = svc.encrypt("hello").split(":") as [string, string, string];
      expect(() => svc.decrypt(`${iv}:${tag.slice(0, 8)}:${data}`)).toThrow("Token decryption failed");
    });

    it("rejects malformed formats", () => {
      const svc = build();
      const [iv, tag, data] = svc.encrypt("hello").split(":") as [string, string, string];
      expect(() => svc.decrypt("onlyonepart")).toThrow("Token decryption failed");
      expect(() => svc.decrypt(`${iv}:${tag}:${data}:extra`)).toThrow("Token decryption failed");
    });

    describe("tamper resistance", () => {
      const parts = () => build().encrypt("hello-world-token").split(":") as [string, string, string];
      const flip = (hex: string) => (hex[0] === "0" ? "1" : "0") + hex.slice(1);

      it.each([12, 8, 4, 1])("rejects a GCM tag truncated to %i bytes", (bytes) => {
        const [iv, tag, data] = parts();
        expect(() => build().decrypt(`${iv}:${tag.slice(0, bytes * 2)}:${data}`)).toThrow("Token decryption failed");
      });

      it("rejects an empty or over-long tag", () => {
        const [iv, tag, data] = parts();
        expect(() => build().decrypt(`${iv}::${data}`)).toThrow("Token decryption failed");
        expect(() => build().decrypt(`${iv}:${tag}00:${data}`)).toThrow("Token decryption failed");
      });

      it("rejects a modified tag, ciphertext or iv", () => {
        const [iv, tag, data] = parts();
        expect(() => build().decrypt(`${iv}:${flip(tag)}:${data}`)).toThrow("Token decryption failed");
        expect(() => build().decrypt(`${iv}:${tag}:${flip(data)}`)).toThrow("Token decryption failed");
        expect(() => build().decrypt(`${flip(iv)}:${tag}:${data}`)).toThrow("Token decryption failed");
      });

      it("rejects a short iv and non-hex input", () => {
        const [iv, tag, data] = parts();
        expect(() => build().decrypt(`${iv.slice(0, 24)}:${tag}:${data}`)).toThrow("Token decryption failed");
        expect(() => build().decrypt(`${iv}:${tag}:zz${data}`)).toThrow("Token decryption failed");
        expect(() => build().decrypt(`${iv}:${tag}x:${data}`)).toThrow("Token decryption failed");
      });
    });

    it("cannot decrypt with a different key", () => {
      const blob = build().encrypt("hello");
      expect(() => build("cd".repeat(32)).decrypt(blob)).toThrow("Token decryption failed");
    });

    it("wraps cipher failures as a generic encryption error", () => {
      const svc = build();
      const spy = jest.spyOn(require("crypto"), "randomBytes").mockImplementationOnce(() => {
        throw "boom";
      });
      expect(() => svc.encrypt("x")).toThrow("Token encryption failed");
      spy.mockRestore();
    });
  });

  describe("bulk helpers", () => {
    it("encrypts/decrypts only the provided tokens", () => {
      const svc = build();
      const enc = svc.encryptTokens({ accessToken: "a", idToken: "i" });
      expect(enc.refreshToken).toBeUndefined();
      expect(enc.accessToken).not.toBe("a");
      expect(svc.decryptTokens(enc)).toEqual({
        accessToken: "a",
        refreshToken: undefined,
        idToken: "i",
      });
    });

    it("decrypts a refreshToken too", () => {
      const svc = build();
      const enc = svc.encryptTokens({ refreshToken: "r" });
      expect(svc.decryptTokens(enc).refreshToken).toBe("r");
    });
  });

  it("generateKey returns a unique 64-hex key accepted by the constructor", () => {
    const k1 = TokenEncryptionService.generateKey();
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(TokenEncryptionService.generateKey()).not.toBe(k1);
    expect(() => build(k1)).not.toThrow();
  });

  describe("secret envelope", () => {
    it("round-trips with a versioned key id and never stores plaintext", () => {
      const svc = build();
      const stored = svc.encryptSecret("super-secret");
      expect(stored.startsWith("enc:v1:")).toBe(true);
      expect(stored).not.toContain("super-secret");
      expect(svc.decryptSecret(stored)).toBe("super-secret");
    });

    it("is idempotent on already-enveloped values", () => {
      const svc = build();
      const stored = svc.encryptSecret("x");
      expect(svc.encryptSecret(stored)).toBe(stored);
      expect(svc.isSecretEnvelope(stored)).toBe(true);
      expect(svc.isSecretEnvelope("plain")).toBe(false);
    });

    it("fails closed for plaintext and unknown key ids", () => {
      const svc = build();
      expect(() => svc.decryptSecret("plain")).toThrow();
      expect(() => svc.decryptSecret("enc:v9:aa:bb:cc")).toThrow();
    });
  });
});

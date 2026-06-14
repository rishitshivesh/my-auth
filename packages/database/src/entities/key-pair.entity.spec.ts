import { KeyPair } from "./key-pair.entity";

describe("KeyPair entity", () => {
  it("can be instantiated with required fields", () => {
    const kp = new KeyPair();
    kp.id = "550e8400-e29b-41d4-a716-446655440000";
    kp.kid = "test-kid-1";
    kp.tenantId = null;
    kp.algorithm = "RS256";
    kp.use = "sig";
    kp.publicKeyPem = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
    kp.encryptedPrivateKey = "encrypted-data";
    kp.authTag = "auth-tag";
    kp.status = "active";
    kp.createdAt = new Date();
    kp.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    kp.retiredAt = null;
    kp.revokedAt = null;

    expect(kp.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(kp.kid).toBe("test-kid-1");
    expect(kp.tenantId).toBeNull();
    expect(kp.algorithm).toBe("RS256");
    expect(kp.use).toBe("sig");
    expect(kp.status).toBe("active");
    expect(kp.retiredAt).toBeNull();
    expect(kp.revokedAt).toBeNull();
  });

  it("supports tenant-scoped keys", () => {
    const kp = new KeyPair();
    kp.tenantId = "tenant-uuid-123";
    kp.status = "active";

    expect(kp.tenantId).toBe("tenant-uuid-123");
  });

  it("supports retired and revoked statuses", () => {
    const kp = new KeyPair();

    kp.status = "retired";
    kp.retiredAt = new Date("2026-01-01");
    expect(kp.status).toBe("retired");
    expect(kp.retiredAt).toEqual(new Date("2026-01-01"));

    kp.status = "revoked";
    kp.revokedAt = new Date("2026-02-01");
    expect(kp.status).toBe("revoked");
    expect(kp.revokedAt).toEqual(new Date("2026-02-01"));
  });
});

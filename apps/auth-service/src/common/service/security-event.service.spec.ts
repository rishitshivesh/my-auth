import { SecurityEventService } from "./security-event.service";

const { sanitizeMetadata } = SecurityEventService;

describe("SecurityEventService.sanitizeMetadata", () => {
  // ── Identity / pass-through ──────────────────────────────────────────────

  it("returns the same keys when no sensitive key is present", () => {
    const input = { userId: "abc", reason: "test", count: 3 };
    expect(sanitizeMetadata(input)).toEqual(input);
  });

  it("preserves boolean, number, null and array values", () => {
    const input = { ok: true, n: 42, nil: null, arr: [1, 2, 3] };
    expect(sanitizeMetadata(input)).toEqual(input);
  });

  // ── Exact sensitive key names ────────────────────────────────────────────

  it("strips a key named exactly 'password'", () => {
    const result = sanitizeMetadata({ password: "s3cr3t", email: "x@y.com" });
    expect(result).not.toHaveProperty("password");
    expect(result).toHaveProperty("email", "x@y.com");
  });

  it("strips a key named exactly 'secret'", () => {
    expect(sanitizeMetadata({ secret: "abc" })).toEqual({});
  });

  it("strips a key named exactly 'token'", () => {
    expect(sanitizeMetadata({ token: "jwt...." })).toEqual({});
  });

  it("strips a key named exactly 'hash'", () => {
    expect(sanitizeMetadata({ hash: "sha256..." })).toEqual({});
  });

  it("strips a key named exactly 'key'", () => {
    expect(sanitizeMetadata({ key: "apikey123" })).toEqual({});
  });

  it("strips a key named exactly 'credential'", () => {
    expect(sanitizeMetadata({ credential: "cred" })).toEqual({});
  });

  it("strips a key named exactly 'private'", () => {
    expect(sanitizeMetadata({ private: "data" })).toEqual({});
  });

  // ── Substring / compound key names ─────────────────────────────────────

  it("strips 'passwordHash' (contains 'password')", () => {
    const result = sanitizeMetadata({ passwordHash: "argon2...", id: "1" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).toHaveProperty("id", "1");
  });

  it("strips 'refreshToken' (contains 'token')", () => {
    const result = sanitizeMetadata({ refreshToken: "rt...", userId: "u1" });
    expect(result).not.toHaveProperty("refreshToken");
    expect(result).toHaveProperty("userId", "u1");
  });

  it("strips 'apiKey' (contains 'key')", () => {
    expect(sanitizeMetadata({ apiKey: "key123" })).toEqual({});
  });

  it("strips 'clientSecret' (contains 'secret')", () => {
    expect(sanitizeMetadata({ clientSecret: "s" })).toEqual({});
  });

  it("strips 'privateKey' (contains 'private' AND 'key')", () => {
    expect(sanitizeMetadata({ privateKey: "pk..." })).toEqual({});
  });

  it("strips 'credentials' (contains 'credential')", () => {
    expect(sanitizeMetadata({ credentials: {} })).toEqual({});
  });

  // ── Case-insensitive matching ─────────────────────────────────────────

  it("strips 'PASSWORD' (upper-case)", () => {
    expect(sanitizeMetadata({ PASSWORD: "X" })).toEqual({});
  });

  it("strips 'Token' (mixed case)", () => {
    expect(sanitizeMetadata({ Token: "X" })).toEqual({});
  });

  it("strips 'ACCESS_TOKEN' (snake-case upper)", () => {
    expect(sanitizeMetadata({ ACCESS_TOKEN: "X", ok: 1 })).toEqual({ ok: 1 });
  });

  // ── Recursive / nested objects ────────────────────────────────────────

  it("strips sensitive keys inside a nested object", () => {
    const input = {
      meta: {
        password: "hidden",
        sessionId: "s1",
      },
      outer: "ok",
    };
    expect(sanitizeMetadata(input)).toEqual({
      meta: { sessionId: "s1" },
      outer: "ok",
    });
  });

  it("strips deeply nested sensitive keys", () => {
    const input = {
      level1: {
        level2: {
          apiKey: "secret",
          allowed: true,
        },
      },
    };
    expect(sanitizeMetadata(input)).toEqual({
      level1: { level2: { allowed: true } },
    });
  });

  it("sanitizes objects nested inside arrays", () => {
    const input = {
      items: [{ password: "must be stripped", label: "a" }, "plain", 3],
      safe: "yes",
    };
    const result = sanitizeMetadata(input);
    expect(result).toHaveProperty("safe", "yes");
    expect(result.items).toEqual([{ label: "a" }, "plain", 3]);
  });

  it("keeps descriptor keys that only describe secrets", () => {
    expect(
      sanitizeMetadata({ keyId: "kid-1", tokenType: "refresh", secretCount: 2, token_ttl: 60 }),
    ).toEqual({ keyId: "kid-1", tokenType: "refresh", secretCount: 2, token_ttl: 60 });
  });

  it("strips otp, cookie and authorization values", () => {
    expect(sanitizeMetadata({ otp: "123456", cookie: "a=b", Authorization: "Bearer x", ok: true })).toEqual({ ok: true });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it("returns {} for null input", () => {
    expect(sanitizeMetadata(null)).toEqual({});
  });

  it("returns {} for a primitive string input", () => {
    expect(sanitizeMetadata("string")).toEqual({});
  });

  it("returns {} for a number input", () => {
    expect(sanitizeMetadata(42)).toEqual({});
  });

  it("returns {} for an array input (not an object)", () => {
    expect(sanitizeMetadata([1, 2, 3])).toEqual({});
  });

  it("returns {} for an empty object", () => {
    expect(sanitizeMetadata({})).toEqual({});
  });

  it("returns {} for undefined input", () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
  });

  it("does not mutate the original object", () => {
    const original = { password: "secret", safe: "value" };
    const copy = { ...original };
    sanitizeMetadata(original);
    expect(original).toEqual(copy);
  });

  // ── Real-world payload examples ───────────────────────────────────────

  it("sanitizes a real login-failed metadata payload that leaks password", () => {
    const payload = {
      email: "user@example.com",
      reason: "invalid_password",
      password: "SuperSecret123!",       // leaked — must be stripped
      passwordHash: "argon2...",          // leaked — must be stripped
    };
    const result = sanitizeMetadata(payload);
    expect(result).toEqual({
      email: "user@example.com",
      reason: "invalid_password",
    });
  });

  it("sanitizes OAuth metadata that contains tokens", () => {
    const payload = {
      provider: "google",
      accessToken: "ya29.xxx",
      refreshToken: "1//xxx",
      tokenExpiry: 3600,
      userId: "u123",
    };
    const result = sanitizeMetadata(payload);
    expect(result).toEqual({
      provider: "google",
      tokenExpiry: 3600,
      userId: "u123",
    });
  });

  it("sanitizes email-sent metadata (no sensitive fields expected)", () => {
    const payload = {
      emailType: "password_reset",
      recipient: "user@example.com",
      provider: "ses",
      success: true,
      duration: 120,
    };
    // None of these keys are sensitive; all should pass through
    expect(sanitizeMetadata(payload)).toEqual(payload);
  });
});

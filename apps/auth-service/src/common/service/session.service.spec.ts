import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { Tenant } from "@repo/database";
import { RedisService } from "./redis.service";
import { tenantStorage } from "@/core/database/tenant-context.service";
import { SessionService } from "./session.service";

jest.mock("@/common/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
import { logger } from "@/common/logger";

const NOW = new Date("2026-06-01T00:00:00Z");
const TTL = 604800;

function build(ttl: unknown = TTL) {
  const query = jest.fn().mockResolvedValue([]);
  const findOne = jest.fn();
  const ds = { manager: { query, findOne } } as unknown as DataSource;
  const cache = { get: jest.fn().mockResolvedValue("fk_acme"), set: jest.fn().mockResolvedValue(undefined) };
  const redis = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    extendTTL: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn().mockReturnValue(ttl) } as unknown as ConfigService;
  const service = new SessionService(ds, cache as never, redis as unknown as RedisService, config);
  return { service, query, findOne, cache, redis };
}

const dbRow = (o: Record<string, unknown> = {}) => ({
  id: "s1",
  user_id: "u1",
  tenant_id: "t1",
  refresh_token_family_id: "fam",
  refresh_token_hash: "h",
  ip_address: "1.1.1.1",
  user_agent: "UA",
  device_id: "d",
  last_activity: "2026-06-01T00:00:00Z",
  expires_at: "2026-06-08T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  userEmail: "a@b.c",
  ...o,
});

describe("SessionService", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...env };
  });

  describe("schema resolution", () => {
    it("uses the cached schema without hitting the DB", async () => {
      const { service, query, findOne } = build();
      await service.getUserSessions("t1", "u1");
      expect(findOne).not.toHaveBeenCalled();
      expect(query.mock.calls[0]![0]).toContain('"fk_acme"."sessions"');
    });

    it("looks up the tenant on cache miss, sanitises the slug and caches 10 minutes", async () => {
      const { service, cache, findOne, query } = build();
      cache.get.mockResolvedValue(undefined);
      findOne.mockResolvedValue({ slug: 'Ev"il-Co' });
      await service.getUserSessions("t1", "u1");
      expect(findOne).toHaveBeenCalledWith(Tenant, { where: { id: "t1" } });
      expect(cache.set).toHaveBeenCalledWith("schema:tid:t1", "fk_ev_il_co", 600_000);
      expect(query.mock.calls[0]![0]).toContain('"fk_ev_il_co"."sessions"');
    });

    it("falls back to the platform slug for unknown tenants", async () => {
      process.env.SENTRY_PLATFORM_SLUG = "plat";
      const { service, cache, findOne, query } = build();
      cache.get.mockResolvedValue(null);
      findOne.mockResolvedValue(null);
      await service.getUserSessions("ghost", "u1");
      expect(query.mock.calls[0]![0]).toContain('"fk_plat"."sessions"');
    });

    it("uses the platform schema for an empty tenant id without cache lookups", async () => {
      const { service, cache, query } = build();
      await service.getUserSessions("", "u1");
      expect(cache.get).not.toHaveBeenCalled();
      expect(query.mock.calls[0]![0]).toContain('"fk_sentry"."sessions"');
    });
  });

  describe("createSession", () => {
    it("inserts in the tenant schema with parameters and mirrors into Redis with TTL", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValue([dbRow()]);
      const s = await service.createSession({
        userId: "u1",
        tenantId: "t1",
        email: "a@b.c",
        refreshTokenFamilyId: "fam",
        refreshTokenHash: "h",
        ipAddress: "1.1.1.1",
        userAgent: "UA",
        deviceId: "d",
      });
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO "fk_acme"."sessions"');
      expect(params.slice(0, 7)).toEqual(["u1", "t1", "fam", "h", "1.1.1.1", "UA", "d"]);
      expect(params[7]).toEqual(NOW);
      expect(params[8]).toEqual(new Date(NOW.getTime() + TTL * 1000));
      expect(s).toMatchObject({ id: "s1", userId: "u1", tenantId: "t1", refreshTokenFamilyId: "fam" });
      expect(redis.set).toHaveBeenCalledWith(
        "t1",
        "session",
        "s1",
        expect.objectContaining({ id: "s1", email: "a@b.c", userId: "u1" }),
        TTL,
      );
    });

    it("persists the login's amr on the row and in Redis", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValue([dbRow()]);
      await service.createSession({ userId: "u1", tenantId: "t1", email: "a@b.c", amr: ["pwd", "otp", "mfa"] });
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"amr"');
      expect(params[9]).toBe("pwd otp mfa");
      expect(redis.set).toHaveBeenCalledWith("t1", "session", "s1", expect.objectContaining({ amr: ["pwd", "otp", "mfa"] }), TTL);
    });

    it("shares the open tenant transaction's connection when one is in scope", async () => {
      const { service, query } = build();
      const txQuery = jest.fn().mockResolvedValue([dbRow()]);
      await tenantStorage.run(
        { queryRunner: { manager: { query: txQuery } }, schemaName: "fk_acme" } as never,
        () => service.createSession({ userId: "u", tenantId: "t1", email: "e" }),
      );
      expect(txQuery).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    });

    it("passes NULL for omitted optional fields and tolerates null timestamps", async () => {
      const { service, query } = build();
      query.mockResolvedValue([dbRow({ last_activity: null, expires_at: null, created_at: null })]);
      const s = await service.createSession({ userId: "u", tenantId: "t1", email: "e" });
      expect(query.mock.calls[0]![1].slice(2, 7)).toEqual([null, null, null, null, null]);
      expect(s.lastActivity).toBeNull();
      expect(s.expiresAt).toBeNull();
    });

    it("does not touch Redis when the insert fails", async () => {
      const { service, query, redis } = build();
      query.mockRejectedValue(new Error("pg"));
      await expect(service.createSession({ userId: "u", tenantId: "t1", email: "e" })).rejects.toThrow("pg");
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("uses SESSION_TTL from config", async () => {
      const { service, query, redis } = build(60);
      query.mockResolvedValue([dbRow()]);
      await service.createSession({ userId: "u", tenantId: "t1", email: "e" });
      expect(query.mock.calls[0]![1][8]).toEqual(new Date(NOW.getTime() + 60_000));
      expect(redis.set.mock.calls[0]![4]).toBe(60);
    });
  });

  describe("validateSession", () => {
    const cached = (expiresAt: string) => ({ id: "s1", userId: "u1", tenantId: "t1", email: "e", expiresAt });

    it("accepts a live Redis session and slides the TTL", async () => {
      const { service, redis, query } = build();
      const data = cached("2026-06-02T00:00:00Z");
      redis.get.mockResolvedValue(data);
      await expect(service.validateSession("t1", "s1")).resolves.toBe(data);
      expect(redis.extendTTL).toHaveBeenCalledWith("t1", "session", "s1", TTL);
      expect(query).not.toHaveBeenCalled();
    });

    it("rejects and evicts an expired Redis session", async () => {
      const { service, redis, query } = build();
      redis.get.mockResolvedValue(cached("2026-05-31T23:59:59Z"));
      await expect(service.validateSession("t1", "s1")).resolves.toBeNull();
      expect(redis.delete).toHaveBeenCalledWith("t1", "session", "s1");
      expect(redis.extendTTL).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    });

    it("on cache miss loads from Postgres (tenant + non-revoked), re-caches and bumps last_activity", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValueOnce([dbRow()]).mockResolvedValueOnce([]);
      const out = await service.validateSession("t1", "s1");
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("revoked_at IS NULL");
      expect(sql).toContain("s.tenant_id = $2");
      expect(params).toEqual(["s1", "t1"]);
      expect(out).toMatchObject({ id: "s1", userId: "u1", email: "a@b.c", ipAddress: "1.1.1.1" });
      expect(redis.set).toHaveBeenCalledWith("t1", "session", "s1", out, TTL);
      expect(query.mock.calls[1]![0]).toContain("UPDATE");
    });

    it("returns null for revoked/unknown sessions", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValue([]);
      await expect(service.validateSession("t1", "nope")).resolves.toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns null for a session expired in Postgres and does not cache it", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValue([dbRow({ expires_at: "2026-05-31T00:00:00Z" })]);
      await expect(service.validateSession("t1", "s1")).resolves.toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("defaults missing email/nullable columns", async () => {
      const { service, query } = build();
      query
        .mockResolvedValueOnce([dbRow({ userEmail: null, ip_address: null, user_agent: null, device_id: null, created_at: null })])
        .mockResolvedValueOnce([]);
      const out = await service.validateSession("t1", "s1");
      expect(out).toMatchObject({ email: "", ipAddress: undefined, userAgent: undefined, deviceId: undefined });
      expect(out!.createdAt).toEqual(NOW);
    });

    it("accepts a session with no expiry in Postgres only if expiresAt falsy path is reached", async () => {
      const { service, query } = build();
      query.mockResolvedValueOnce([dbRow({ expires_at: null })]).mockResolvedValueOnce([]);
      const out = await service.validateSession("t1", "s1");
      expect(out).not.toBeNull();
    });

    it("logs but swallows a failing last_activity update", async () => {
      const { service, query } = build();
      query.mockResolvedValueOnce([dbRow()]).mockRejectedValueOnce(new Error("pg"));
      await expect(service.validateSession("t1", "s1")).resolves.not.toBeNull();
      await Promise.resolve();
      await Promise.resolve();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("revocation", () => {
    it("revokeSession scopes by tenant and clears the hash and Redis key", async () => {
      const { service, query, redis } = build();
      await service.revokeSession("t1", "s1");
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("refresh_token_hash = NULL");
      expect(params).toEqual([NOW, "user_logout", "s1", "t1"]);
      expect(redis.delete).toHaveBeenCalledWith("t1", "session", "s1");
    });

    it("revokeAllUserSessions deletes every active session from Redis", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]).mockResolvedValueOnce([]);
      await service.revokeAllUserSessions("t1", "u1", "pw");
      expect(query.mock.calls[1]![1]).toEqual([NOW, "pw", "u1", "t1"]);
      expect(redis.delete.mock.calls.map((c) => c[2])).toEqual(["a", "b"]);
    });

    it("revokeAllUserSessions with no sessions touches no Redis keys", async () => {
      const { service, redis } = build();
      await service.revokeAllUserSessions("t1", "u1");
      expect(redis.delete).not.toHaveBeenCalled();
    });

    it("revokeOtherUserSessions keeps one session and revokes its siblings + refresh tokens", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]).mockResolvedValueOnce([]);
      await expect(service.revokeOtherUserSessions("t1", "u1", "keep", "pw_change")).resolves.toEqual(["a", "b"]);
      expect(query.mock.calls[0]![1]).toEqual([NOW, "pw_change", "u1", "t1", "keep"]);
      expect(query.mock.calls[1]![0]).toContain("oauth_refresh_tokens");
      expect(query.mock.calls[1]![1][4]).toBe("keep");
      expect(redis.delete).toHaveBeenCalledTimes(2);
    });

    it("revokeOtherUserSessions with no exception uses the nil UUID and unwraps [rows,count]", async () => {
      const { service, query } = build();
      query.mockResolvedValueOnce([[{ id: "x" }], 1]).mockResolvedValueOnce([]);
      await expect(service.revokeOtherUserSessions("t1", "u1", undefined, "r")).resolves.toEqual(["x"]);
      expect(query.mock.calls[0]![1][4]).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("revokeSessionFamily revokes all family sessions and evicts them from Redis", async () => {
      const { service, query, redis } = build();
      query.mockResolvedValueOnce([{ id: "a" }]).mockResolvedValueOnce([]);
      await service.revokeSessionFamily("t1", "fam");
      expect(query.mock.calls[1]![1]).toEqual([NOW, "token_reuse_detected", "fam", "t1"]);
      expect(redis.delete).toHaveBeenCalledWith("t1", "session", "a");
      expect(logger.warn).toHaveBeenCalled();
    });

    // BUG: revokeSessionFamily does not NULL refresh_token_hash like the other revoke paths
    // and its UPDATE has no `revoked_at IS NULL` guard, so it overwrites the original
    // revoked_at/reason of already-revoked sessions (session.service.ts revokeSessionFamily).
    it("revokeSessionFamily nulls the refresh token hash and preserves earlier revocations", async () => {
      const { service, query } = build();
      query.mockResolvedValue([]);
      await service.revokeSessionFamily("t1", "fam");
      const sql = query.mock.calls[1]![0] as string;
      expect(sql).toContain("refresh_token_hash = NULL");
      expect(sql).toContain("revoked_at IS NULL");
    });
  });

  it("updateRefreshToken rotates the hash and extends the Redis TTL", async () => {
    const { service, query, redis } = build();
    await service.updateRefreshToken("t1", "s1", "newhash");
    expect(query.mock.calls[0]![1]).toEqual(["newhash", NOW, NOW, "s1", "t1"]);
    expect(redis.extendTTL).toHaveBeenCalledWith("t1", "session", "s1", TTL);
  });

  describe("getUserSessions", () => {
    it("maps rows to camelCase sessions", async () => {
      const { service, query } = build();
      query.mockResolvedValue([dbRow(), dbRow({ id: "s2", last_activity: null, expires_at: null, created_at: null })]);
      const out = await service.getUserSessions("t1", "u1");
      expect(query.mock.calls[0]![1]).toEqual(["u1", "t1"]);
      expect(out[0]).toMatchObject({ id: "s1", refreshTokenHash: "h", deviceId: "d" });
      expect(out[0]!.lastActivity).toEqual(new Date("2026-06-01T00:00:00Z"));
      expect(out[1]).toMatchObject({ lastActivity: null, expiresAt: null, createdAt: null });
    });
  });
});

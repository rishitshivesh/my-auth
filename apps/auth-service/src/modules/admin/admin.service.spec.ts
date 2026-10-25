import * as fs from "fs";
import { AdminService } from "./admin.service";

jest.mock("@/common/logger", () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock("../auth/password-hashing", () => ({ hashPassword: jest.fn().mockResolvedValue("HASH") }));
jest.mock("fs", () => ({ ...jest.requireActual("fs"), mkdirSync: jest.fn(), writeFileSync: jest.fn(), readFileSync: jest.fn() }));

import { logger } from "@/common/logger";

type Mock = jest.Mock;
const repo = () => ({
  findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn((v: object) => ({ ...v })),
  save: jest.fn(async (v: object): Promise<Record<string, unknown>> => ({ id: "gen", ...v })), update: jest.fn(), delete: jest.fn(), createQueryBuilder: jest.fn(),
});

function makeQr(over: Partial<Record<string, Mock>> = {}) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([{ id: "r1", name: "sentry-internal" }]),
    save: jest.fn(async (v: object) => ({ id: "saved", ...v })),
    create: jest.fn((_e: unknown, v: object) => ({ ...v })),
    getRepository: jest.fn(),
  };
  return {
    connect: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([]), startTransaction: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), manager, ...over,
  };
}

function build() {
  const qr = makeQr();
  const dataSource = { createQueryRunner: jest.fn(() => qr) };
  const users = repo(), sessions = repo(), tenants = repo(), events = repo(), roles = repo(), userRoles = repo();
  const redis = { getDailyApiCallCounts: jest.fn().mockResolvedValue([0]), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  const sessionService = { createSession: jest.fn().mockResolvedValue({ id: "s1" }) };
  const jwks = { deleteTenantKeys: jest.fn().mockResolvedValue(undefined), ensureTenantKeyExists: jest.fn(), getCurrentSigningKey: jest.fn().mockResolvedValue({ kid: "k", privateKey: { export: () => "PEM" } }) };
  const refresh = { createRefreshToken: jest.fn().mockResolvedValue({ token: "RT" }) };
  const jwt = { sign: jest.fn().mockReturnValue("AT") };
  const schema = { createSchema: jest.fn(), dropSchema: jest.fn().mockResolvedValue(undefined) };
  const tenantService = { invalidateCache: jest.fn() };
  const service = new AdminService(
    dataSource as never, users as never, sessions as never, tenants as never, events as never, roles as never, userRoles as never,
    redis as never, sessionService as never, jwks as never, refresh as never, jwt as never, schema as never,
    tenantService as never,
  );
  return { service, qr, users, sessions, tenants, events, roles, userRoles, redis, sessionService, jwks, refresh, jwt, schema, tenantService, dataSource };
}

const tenantRow = (o: Record<string, unknown> = {}) => ({
  id: "t1", slug: "acme", name: "Acme", active: true, environment: "production", customDomain: undefined,
  featureFlags: undefined, createdAt: new Date("2026-01-01"), ...o,
});

describe("setup token lifecycle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("generates a 256-bit token and writes it to the log dir when uninitialized", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await fx.service.initSetupToken();
    expect(fx.service.isBootstrapping()).toBe(true);
    expect(fs.mkdirSync).toHaveBeenCalled();
    const written = (fs.writeFileSync as unknown as Mock).mock.calls[0];
    expect(String(written?.[1])).toMatch(/SETUP TOKEN: [0-9a-f]{64}\n$/);
    expect(written?.[2]).toEqual({ flag: "a" });
    expect(fx.service.getSetupLogPath()).toMatch(/setup\.log$/);
  });

  it("does nothing when already initialized", async () => {
    const fx = build();
    fx.qr.manager.getRepository
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ id: "st" }) })
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ id: "role" }) })
      .mockReturnValueOnce({ count: jest.fn().mockResolvedValue(1) });
    await fx.service.onModuleInit();
    expect(fx.service.isBootstrapping()).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fx.service.getSetupLogPath()).toBeNull();
  });

  it("survives a file write failure (token still active in memory)", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    (fs.mkdirSync as unknown as Mock).mockImplementationOnce(() => { throw new Error("EACCES"); });
    await fx.service.initSetupToken();
    expect(fx.service.isBootstrapping()).toBe(true);
    expect(fx.service.getSetupLogPath()).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("invalidateSetupToken ends bootstrapping", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await fx.service.initSetupToken();
    fx.service.invalidateSetupToken();
    expect(fx.service.isBootstrapping()).toBe(false);
  });

  // admin.service.ts initSetupToken logs the raw one-time token via logger.info: secrets must never be logged (AGENTS.md section 3).
  it("never writes the setup token to the application logger", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await fx.service.initSetupToken();
    const logged = JSON.stringify((logger.info as unknown as Mock).mock.calls);
    expect(logged).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("isInitialized / getPlatformInfo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("false when platform tenant is missing; resets search_path and releases", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    expect(await fx.service.isInitialized()).toBe(false);
    expect(fx.qr.query).toHaveBeenLastCalledWith("SET search_path TO public");
    expect(fx.qr.release).toHaveBeenCalled();
  });

  it("false when internal role is missing; false when no members; true with members", async () => {
    const fx = build();
    const mk = (role: unknown, count: number) => fx.qr.manager.getRepository
      .mockReset()
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ id: "st" }) })
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue(role) })
      .mockReturnValueOnce({ count: jest.fn().mockResolvedValue(count) });
    mk(null, 0);
    expect(await fx.service.isInitialized()).toBe(false);
    mk({ id: "r" }, 0);
    expect(await fx.service.isInitialized()).toBe(false);
    mk({ id: "r" }, 2);
    expect(await fx.service.isInitialized()).toBe(true);
  });

  it("fails closed to false on DB errors (and still releases)", async () => {
    const fx = build();
    fx.qr.query.mockRejectedValue(new Error("no schema"));
    expect(await fx.service.isInitialized()).toBe(false);
    expect(fx.qr.release).toHaveBeenCalled();
  });

  it("getPlatformInfo uses tenant name or env/default fallback", async () => {
    const fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    fx.tenants.findOne.mockResolvedValueOnce({ name: "Custom" }).mockResolvedValueOnce(null);
    expect(await fx.service.getPlatformInfo()).toEqual({ slug: "sentry", name: "Custom", initialized: false });
    expect((await fx.service.getPlatformInfo()).name).toBe("Scrolloop Sentry");
  });
});

describe("createFirstAdmin", () => {
  const dto = { name: "Ada Byron Lovelace", email: "ada@x.test", password: "Corr3ct-Horse-Battery-Staple!", platformName: "  PlatX " };
  let fx: ReturnType<typeof build>;
  let token: string;

  async function bootstrap() {
    fx = build();
    fx.qr.manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await fx.service.initSetupToken();
    token = /SETUP TOKEN: ([0-9a-f]{64})/.exec(String((fs.writeFileSync as unknown as Mock).mock.calls.at(-1)?.[1]))![1]!;
    // after bootstrap, isInitialized() must keep returning false for the create call
  }
  beforeEach(async () => { jest.clearAllMocks(); await bootstrap(); });

  it.each([["", "empty"], ["0".repeat(64), "wrong same-length"], ["abc", "short"], ["x".repeat(65), "long"]])(
    "rejects invalid setup token (%s)", async (bad) => {
      await expect(fx.service.createFirstAdmin(dto, bad, "1.1.1.1", "ua")).rejects.toMatchObject({ code: "ACCESS_FORBIDDEN" });
      expect(fx.tenants.save).not.toHaveBeenCalled();
      expect(fx.service.isBootstrapping()).toBe(true);
    });

  it("rejects any token once the setup token has been invalidated", async () => {
    fx.service.invalidateSetupToken();
    await expect(fx.service.createFirstAdmin(dto, token, "i", "u")).rejects.toMatchObject({ code: "ACCESS_FORBIDDEN" });
  });

  it("409 when platform is already initialized", async () => {
    fx.qr.manager.getRepository.mockReset()
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ id: "st" }) })
      .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ id: "r" }) })
      .mockReturnValueOnce({ count: jest.fn().mockResolvedValue(1) });
    await expect(fx.service.createFirstAdmin(dto, token, "i", "u")).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
  });

  it("rejects a weak password before creating schema or users", async () => {
    fx.tenants.findOne.mockResolvedValue({ id: "st", slug: "sentry" });
    await expect(fx.service.createFirstAdmin({ ...dto, password: "password1234" }, token, "i", "u")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    expect(fx.schema.createSchema).not.toHaveBeenCalled();
    expect(fx.qr.startTransaction).not.toHaveBeenCalled();
  });

  it("happy path: bootstraps tenant, role, wildcard permission, user, roles; issues tokens; burns the setup token", async () => {
    fx.tenants.findOne.mockResolvedValue(null);
    fx.tenants.save.mockResolvedValue({ id: "st", slug: "sentry" });
    const out = await fx.service.createFirstAdmin(dto, token, "9.9.9.9", "ua");
    expect(fx.tenants.create).toHaveBeenCalledWith(expect.objectContaining({ name: "PlatX", slug: "sentry" }));
    expect(fx.schema.createSchema).toHaveBeenCalledWith("sentry");
    expect(fx.qr.query).toHaveBeenCalledWith(expect.stringContaining('SET search_path TO "fk_sentry"'));
    expect(fx.qr.commitTransaction).toHaveBeenCalled();
    const userArg = fx.qr.manager.create.mock.calls.find((c) => (c[1] as { email?: string }).email)?.[1] as Record<string, unknown>;
    expect(userArg).toMatchObject({ email: "ada@x.test", passwordHash: "HASH", firstName: "Ada", lastName: "Byron Lovelace", emailVerified: true, mfaEnabled: false });
    expect(JSON.stringify(userArg)).not.toContain(dto.password);
    expect(fx.sessionService.createSession).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: "9.9.9.9", userAgent: "ua" }));
    expect(fx.jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: "sentry", groups: ["sentry-internal"], sessionId: "s1" }),
      expect.objectContaining({ algorithm: "RS256", expiresIn: "15m", privateKey: "PEM", header: { alg: "RS256", kid: "k" } }),
    );
    expect(out).toEqual({ accessToken: "AT", refreshToken: "RT", user: { id: "saved", email: "ada@x.test", name: dto.name } });
    expect(fx.service.isBootstrapping()).toBe(false);
    // replay with same token fails
    await expect(fx.service.createFirstAdmin(dto, token, "i", "u")).rejects.toMatchObject({ code: "ACCESS_FORBIDDEN" });
  });

  it("uses default platform name, single-word name, and reuses existing role/permission", async () => {
    fx.tenants.findOne.mockResolvedValue({ id: "st", slug: "sentry" });
    fx.qr.manager.findOne.mockImplementation(async (entity: { name?: string }, opts: { where: { email?: string } }) => {
      if (opts.where.email) return null;
      return { id: `existing-${entity.name ?? "x"}` };
    });
    await fx.service.createFirstAdmin({ ...dto, name: "Cher" }, token, "i", "u");
    const userArg = fx.qr.manager.create.mock.calls.find((c) => (c[1] as { email?: string }).email)?.[1] as Record<string, unknown>;
    expect(userArg).toMatchObject({ firstName: "Cher", lastName: undefined });
    expect(fx.qr.manager.save).not.toHaveBeenCalledWith(expect.objectContaining({ name: "*:*" }));
  });

  it("duplicate email inside the transaction rolls back and still releases the connection", async () => {
    fx.tenants.findOne.mockResolvedValue({ id: "st", slug: "sentry" });
    fx.qr.manager.findOne.mockResolvedValueOnce({ id: "dup" });
    await expect(fx.service.createFirstAdmin(dto, token, "i", "u")).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(fx.qr.rollbackTransaction).toHaveBeenCalled();
    expect(fx.qr.release).toHaveBeenCalled();
    expect(fx.sessionService.createSession).not.toHaveBeenCalled();
    expect(fx.service.isBootstrapping()).toBe(true);
  });

  it("tolerates rollback/reset failures while propagating the original error", async () => {
    fx.tenants.findOne.mockResolvedValue({ id: "st", slug: "sentry" });
    fx.qr.manager.findOne.mockRejectedValueOnce(new Error("db"));
    fx.qr.rollbackTransaction.mockRejectedValue(new Error("rb"));
    await expect(fx.service.createFirstAdmin(dto, token, "i", "u")).rejects.toThrow("db");
    expect(fx.qr.release).toHaveBeenCalled();
  });
});

describe("tenant management", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getPlatformMetrics sums per-tenant Redis counters and tolerates Redis failures", async () => {
    const fx = build();
    fx.tenants.count.mockResolvedValue(2); fx.users.count.mockResolvedValue(5); fx.sessions.count.mockResolvedValue(3);
    fx.tenants.find.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    fx.redis.getDailyApiCallCounts.mockResolvedValueOnce([10]).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce([]);
    expect(await fx.service.getPlatformMetrics()).toEqual({ totalTenants: 2, totalUsers: 5, activeSessions: 3, apiCallsToday: 10 });
  });

  function qbWith(rows: unknown[], total: number) {
    const qb = { andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([rows, total]) };
    return qb;
  }

  it("listTenants applies filters, paginates and maps status/plan/user counts", async () => {
    const fx = build();
    const qb = qbWith([tenantRow(), tenantRow({ id: "t2", active: false, settings: { plan: "pro" } })], 2);
    fx.tenants.createQueryBuilder.mockReturnValue(qb);
    const ub = { select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ tenantId: "t1", count: "7" }]) };
    fx.users.createQueryBuilder.mockReturnValue(ub);
    const res = await fx.service.listTenants({ search: "ac", status: "active", plan: "pro", page: 3, limit: 10 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining("ILIKE"), { search: "%ac%" });
    expect(qb.andWhere).toHaveBeenCalledWith("t.active = :active", { active: true });
    expect(qb.andWhere).toHaveBeenCalledWith("t.settings ->> 'plan' = :plan", { plan: "pro" });
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(res.total).toBe(2);
    expect(res.tenants[0]).toMatchObject({ id: "t1", status: "active", plan: "free", userCount: 7 });
    expect(res.tenants[1]).toMatchObject({ status: "suspended", plan: "pro", userCount: 0 });
  });

  it("listTenants with no rows skips the user-count query; status!=active means suspended filter", async () => {
    const fx = build();
    const qb = qbWith([], 0);
    fx.tenants.createQueryBuilder.mockReturnValue(qb);
    expect(await fx.service.listTenants({ status: "suspended" })).toEqual({ total: 0, tenants: [] });
    expect(qb.andWhere).toHaveBeenCalledWith("t.active = :active", { active: false });
    expect(fx.users.createQueryBuilder).not.toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it("search term is bound as a parameter (no SQL interpolation)", async () => {
    const fx = build();
    const qb = qbWith([], 0);
    fx.tenants.createQueryBuilder.mockReturnValue(qb);
    await fx.service.listTenants({ search: "x'; DROP TABLE tenants;--" });
    expect(qb.andWhere.mock.calls[0]?.[0]).not.toContain("DROP");
  });

  it("getTenantById assembles detail; 404 when missing", async () => {
    const fx = build();
    fx.tenants.findOne.mockResolvedValueOnce(tenantRow({ settings: { a: 1 }, featureFlags: { f: true } }));
    fx.users.count.mockResolvedValue(4); fx.sessions.count.mockResolvedValue(2);
    fx.events.find.mockResolvedValue([{ id: "e", eventType: "x", actorEmail: "a", severity: "info", createdAt: new Date(0), ipAddress: "1" }]);
    const d = await fx.service.getTenantById("t1");
    expect(d).toMatchObject({ userCount: 4, activeSessions: 2, featureFlags: { f: true }, settings: { a: 1 }, recentActivity: [{ id: "e" }] });
    fx.tenants.findOne.mockResolvedValueOnce(tenantRow());
    expect((await fx.service.getTenantById("t1")).featureFlags).toEqual({});
    fx.tenants.findOne.mockResolvedValueOnce(null);
    await expect(fx.service.getTenantById("zz")).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });

  describe("createTenant", () => {
    it.each(["ab", "abc", "-abcd", "abcd-", "ABCD", "a b c d", 'a"; DROP', "a".repeat(65), "ab_cd", ""])(
      "rejects invalid slug %p before touching the DB", async (slug) => {
        const fx = build();
        await expect(fx.service.createTenant({ name: "n", slug })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(fx.tenants.findOne).not.toHaveBeenCalled();
      });

    it.each(["abcd", "a-b-c", "a".repeat(64), "ab1-2cd"])("accepts valid slug %s (boundaries 4..64)", async (slug) => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      await expect(fx.service.createTenant({ name: "n", slug })).resolves.toBeDefined();
    });

    it("409 when slug exists", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValue({ id: "x" });
      await expect(fx.service.createTenant({ name: "n", slug: "acme" })).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
      expect(fx.tenants.save).not.toHaveBeenCalled();
    });

    it("creates tenant, provisions key, sets plan/environment default; no admin provisioning without currentUserId", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      await fx.service.createTenant({ name: "Acme", slug: "acme", plan: "pro" });
      expect(fx.tenants.create).toHaveBeenCalledWith(expect.objectContaining({ environment: "production", active: true }));
      expect(fx.jwks.ensureTenantKeyExists).toHaveBeenCalledWith("gen");
      expect(fx.schema.createSchema).not.toHaveBeenCalled();
    });

    it("with currentUserId provisions schema and owner user transactionally", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      fx.qr.query.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM users")) return [{ email: "o@x", password_hash: "h", first_name: "O", last_name: null, display_name: "O", avatar_url: null }];
        if (sql.includes("INSERT INTO roles")) return [{ id: "role1" }];
        if (sql.includes("INSERT INTO users")) return [{ id: "nu" }];
        return [];
      });
      await fx.service.createTenant({ name: "Acme", slug: "acme", currentUserId: "src" });
      expect(fx.schema.createSchema).toHaveBeenCalledWith("acme");
      expect(fx.qr.commitTransaction).toHaveBeenCalled();
      expect(fx.qr.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO user_roles"), ["gen", "nu", "role1"]);
      expect(fx.qr.release).toHaveBeenCalled();
    });

    it("provisioning: missing source user is skipped; email collision rolls back; errors are non-fatal", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      await fx.service.createTenant({ name: "A", slug: "acme", currentUserId: "src" });
      expect(fx.qr.commitTransaction).not.toHaveBeenCalled();

      const fx2 = build();
      fx2.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      fx2.qr.query.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM users")) return [{ email: "o@x" }];
        if (sql.includes("INSERT INTO roles")) return [{ id: "r" }];
        return [];
      });
      await fx2.service.createTenant({ name: "A", slug: "acme", currentUserId: "src" });
      expect(fx2.qr.rollbackTransaction).toHaveBeenCalled();

      const fx3 = build();
      fx3.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      fx3.qr.query.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM users")) throw new Error("boom");
        return [];
      });
      await expect(fx3.service.createTenant({ name: "A", slug: "acme", currentUserId: "src" })).resolves.toBeDefined();
      expect(fx3.qr.release).toHaveBeenCalled();
    });

    // createTenant enforces only the slug regex; the RESERVED list lives in checkSlugAvailability and is bypassable by calling create directly.
    it("refuses reserved slugs such as 'admin' or 'login'", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
      await expect(fx.service.createTenant({ name: "n", slug: "admin" })).rejects.toBeDefined();
    });
  });

  it("updateTenant applies only provided fields; 404 when missing", async () => {
    const fx = build();
    fx.tenants.findOne.mockResolvedValue(tenantRow());
    await fx.service.updateTenant("t1", { status: "suspended", name: "N", plan: "pro" });
    expect(fx.tenants.update).toHaveBeenCalledWith({ id: "t1" }, { name: "N", active: false, settings: { plan: "pro" } });
    await fx.service.updateTenant("t1", {});
    expect(fx.tenants.update).toHaveBeenLastCalledWith({ id: "t1" }, {});
    await fx.service.updateTenant("t1", { status: "active" });
    expect(fx.tenants.update).toHaveBeenLastCalledWith({ id: "t1" }, { active: true });
    fx.tenants.findOne.mockResolvedValue(null);
    await expect(fx.service.updateTenant("x", {})).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });

  it("deleteTenant", async () => {
    const fx = build();
    fx.tenants.findOne.mockResolvedValueOnce(tenantRow());
    await fx.service.deleteTenant("t1");
    expect(fx.tenants.delete).toHaveBeenCalledWith({ id: "t1" });
    expect(fx.schema.dropSchema).toHaveBeenCalled();
    expect(fx.jwks.deleteTenantKeys).toHaveBeenCalledWith("t1");
    fx.tenants.findOne.mockResolvedValueOnce(null);
    await expect(fx.service.deleteTenant("t1")).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });
});

describe("checkSlugAvailability", () => {
  it.each([
    ["abc", "at least 4"], ["a".repeat(64), "63 characters"], ["Abcd", "lowercase"], ["ab_cd", "lowercase"],
    ["-abcd", "hyphen"], ["abcd-", "hyphen"], ["admin", "reserved"], ["login", "reserved"],
  ])("rejects %s", async (slug, reason) => {
    const fx = build();
    const res = await fx.service.checkSlugAvailability(slug);
    expect(res.available).toBe(false);
    expect(res.reason?.toLowerCase()).toContain(reason.toLowerCase());
    expect(fx.tenants.findOne).not.toHaveBeenCalled();
  });

  it("accepts boundary lengths 4 and 63", async () => {
    const fx = build();
    expect((await fx.service.checkSlugAvailability("abcd")).available).toBe(true);
    expect((await fx.service.checkSlugAvailability("a".repeat(63))).available).toBe(true);
  });

  it("unavailable when reserved in Redis or taken in DB; reserves otherwise for 300s", async () => {
    const fx = build();
    fx.redis.get.mockResolvedValueOnce("pending");
    expect((await fx.service.checkSlugAvailability("freshslug")).reason).toMatch(/claimed/);
    fx.tenants.findOne.mockResolvedValueOnce({ id: "x" });
    expect((await fx.service.checkSlugAvailability("freshslug")).reason).toMatch(/taken/);
    fx.tenants.findOne.mockResolvedValueOnce(null);
    expect(await fx.service.checkSlugAvailability("freshslug")).toEqual({ available: true });
    expect(fx.redis.set).toHaveBeenCalledWith("", "", "common:slug:reservation:freshslug", "pending", 300);
  });

  it("degrades gracefully when Redis is down", async () => {
    const fx = build();
    fx.redis.get.mockRejectedValue(new Error("down"));
    fx.redis.set.mockRejectedValue(new Error("down"));
    expect(await fx.service.checkSlugAvailability("freshslug")).toEqual({ available: true });
  });
});

describe("activity, team, settings", () => {
  beforeEach(() => { jest.clearAllMocks(); delete process.env["SMTP_HOST"]; delete process.env["SUPPORT_EMAIL"]; });

  it("getRecentActivity maps events with limit", async () => {
    const fx = build();
    fx.events.find.mockResolvedValue([{ id: "e", eventType: "t", actorEmail: "a", severity: "info", createdAt: new Date(0), ipAddress: "1", tenantId: "t1" }]);
    const res = await fx.service.getRecentActivity(7);
    expect(fx.events.find).toHaveBeenCalledWith({ order: { createdAt: "DESC" }, take: 7 });
    expect(res[0]).toMatchObject({ id: "e", tenantId: "t1" });
    await fx.service.getRecentActivity();
    expect(fx.events.find).toHaveBeenLastCalledWith({ order: { createdAt: "DESC" }, take: 20 });
  });

  describe("team", () => {
    it("getTeamMembers: empty when tenant or role missing; maps members otherwise", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null);
      expect(await fx.service.getTeamMembers()).toEqual([]);
      fx.tenants.findOne.mockResolvedValueOnce({ id: "st" });
      fx.roles.findOne.mockResolvedValueOnce(null);
      expect(await fx.service.getTeamMembers()).toEqual([]);
      fx.tenants.findOne.mockResolvedValueOnce({ id: "st" });
      fx.roles.findOne.mockResolvedValueOnce({ id: "r" });
      fx.userRoles.find.mockResolvedValue([{ assignedAt: new Date(0), user: { id: "u", email: "e", firstName: "F", lastName: "L" } }]);
      expect(await fx.service.getTeamMembers()).toEqual([{ id: "u", email: "e", firstName: "F", lastName: "L", addedAt: new Date(0) }]);
    });

    it("addTeamMember: 404 for missing tenant/user, 409 for existing member", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null);
      await expect(fx.service.addTeamMember("a@x")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      fx.tenants.findOne.mockResolvedValue({ id: "st" });
      fx.users.findOne.mockResolvedValueOnce(null);
      await expect(fx.service.addTeamMember("a@x")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      fx.users.findOne.mockResolvedValue({ id: "u", email: "a@x" });
      fx.roles.findOne.mockResolvedValue({ id: "r" });
      fx.userRoles.findOne.mockResolvedValue({ id: "ur" });
      await expect(fx.service.addTeamMember("a@x")).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
      expect(fx.users.findOne).toHaveBeenLastCalledWith({ where: { email: "a@x", tenantId: "st" } });
    });

    it("addTeamMember creates the internal role if absent and assigns it", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValue({ id: "st" });
      fx.users.findOne.mockResolvedValue({ id: "u", email: "a@x", firstName: "A", lastName: "B" });
      fx.roles.findOne.mockResolvedValue(null);
      fx.userRoles.findOne.mockResolvedValue(null);
      fx.userRoles.create.mockReturnValue({ assignedAt: new Date(0) });
      const res = await fx.service.addTeamMember("a@x");
      expect(fx.roles.create).toHaveBeenCalledWith(expect.objectContaining({ name: "sentry-internal", isSystem: true, tenantId: "st" }));
      expect(fx.userRoles.save).toHaveBeenCalled();
      expect(res).toMatchObject({ id: "u", email: "a@x", addedAt: new Date(0) });
    });

    it("removeTeamMember: 404 chain then delete", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValueOnce(null);
      await expect(fx.service.removeTeamMember("u")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      fx.tenants.findOne.mockResolvedValue({ id: "st" });
      fx.roles.findOne.mockResolvedValueOnce(null);
      await expect(fx.service.removeTeamMember("u")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      fx.roles.findOne.mockResolvedValue({ id: "r" });
      fx.userRoles.findOne.mockResolvedValueOnce(null);
      await expect(fx.service.removeTeamMember("u")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      fx.userRoles.findOne.mockResolvedValueOnce({ id: "ur" });
      await fx.service.removeTeamMember("u");
      expect(fx.userRoles.delete).toHaveBeenCalledWith({ id: "ur" });
    });
  });

  describe("settings", () => {
    it("defaults when no tenant/settings", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValue(null);
      expect(await fx.service.getPlatformSettings()).toEqual({
        platformName: "Scrolloop Sentry", smtpConfigured: false, smtpHost: undefined, supportEmail: undefined, allowPublicSignup: false, maintenanceMode: false,
      });
    });

    it("stored values win over env; env drives smtpConfigured", async () => {
      process.env["SMTP_HOST"] = "env-smtp";
      process.env["SUPPORT_EMAIL"] = "env@x";
      const fx = build();
      fx.tenants.findOne.mockResolvedValue({ id: "st", settings: { platformName: "P", smtpHost: "stored", supportEmail: "s@x", allowPublicSignup: true, maintenanceMode: true } });
      expect(await fx.service.getPlatformSettings()).toEqual({ platformName: "P", smtpConfigured: true, smtpHost: "stored", supportEmail: "s@x", allowPublicSignup: true, maintenanceMode: true });
      fx.tenants.findOne.mockResolvedValue({ id: "st" });
      expect(await fx.service.getPlatformSettings()).toMatchObject({ smtpHost: "env-smtp", supportEmail: "env@x", smtpConfigured: true });
    });

    it("updatePlatformSettings merges only defined keys and falsy booleans", async () => {
      const fx = build();
      const tenant = { id: "st", settings: { platformName: "Old", keep: 1 } };
      fx.tenants.findOne.mockResolvedValue(tenant);
      await fx.service.updatePlatformSettings({ allowPublicSignup: false, maintenanceMode: true, smtpHost: "h", supportEmail: "s", platformName: "New" });
      expect(fx.tenants.update).toHaveBeenCalledWith({ id: "st" }, { settings: { platformName: "New", keep: 1, allowPublicSignup: false, maintenanceMode: true, smtpHost: "h", supportEmail: "s" } });
      await fx.service.updatePlatformSettings({});
      expect(fx.tenants.update).toHaveBeenLastCalledWith({ id: "st" }, { settings: { platformName: "Old", keep: 1 } });
    });

    it("updatePlatformSettings 404s with no platform tenant", async () => {
      const fx = build();
      fx.tenants.findOne.mockResolvedValue(null);
      await expect(fx.service.updatePlatformSettings({})).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    });
  });
});

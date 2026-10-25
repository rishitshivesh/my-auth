import { Repository } from "typeorm";
import { OAuthRefreshToken } from "@repo/database";
import { SessionRepository } from "@/core/database/session.repository";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { SessionManagementService } from "./session-management.service";

const lookup = jest.fn();
jest.mock("geoip-lite", () => ({ lookup: (ip: string) => lookup(ip) }));

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function build() {
  const sessions = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const tokens = { find: jest.fn() };
  const oauth = {
    revokeSessionTokens: jest.fn().mockResolvedValue(undefined),
    revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SessionManagementService(
    sessions as unknown as SessionRepository,
    tokens as unknown as Repository<OAuthRefreshToken>,
    oauth as unknown as OAuthRefreshTokenService,
  );
  (service as unknown as { logger: { log: jest.Mock } }).logger = { log: jest.fn() };
  return { service, sessions, tokens, oauth };
}

const d = (s: string) => new Date(s);

describe("SessionManagementService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lookup.mockReturnValue(null);
  });

  describe("getActiveSessions", () => {
    it("lists sessions with tokens, marks current, parses UA and geo, skips token-less sessions", async () => {
      const { service, sessions, tokens } = build();
      sessions.find.mockResolvedValue([
        { id: "s1", userAgent: CHROME_MAC, ipAddress: "8.8.8.8", lastActivity: d("2026-01-02"), createdAt: d("2026-01-01") },
        { id: "s2", userAgent: undefined, ipAddress: undefined, lastActivity: d("2026-01-02"), createdAt: d("2026-01-01") },
        { id: "s3", userAgent: IPHONE, ipAddress: "1.1.1.1", lastActivity: d("2026-01-03"), createdAt: d("2026-01-01") },
      ]);
      tokens.find.mockImplementation(async ({ where }: { where: { sessionId: string } }) => {
        if (where.sessionId === "s2") return [];
        return [
          { familyId: `fam-${where.sessionId}`, createdAt: d("2026-01-05") },
          { familyId: "old", createdAt: d("2026-01-01") },
        ];
      });
      lookup.mockImplementation((ip: string) =>
        ip === "8.8.8.8" ? { city: "Mountain View", country: "US", timezone: "America/Los_Angeles" } : null,
      );

      const out = await service.getActiveSessions("u1", "t1", "s3");

      expect(sessions.find.mock.calls[0]![0].where).toMatchObject({ userId: "u1", tenantId: "t1" });
      expect(tokens.find.mock.calls[0]![0].where).toMatchObject({ tenantId: "t1" });
      expect(out.map((s) => s.id)).toEqual(["s1", "s3"]);
      expect(out[0]).toMatchObject({
        isCurrent: false,
        location: { city: "Mountain View", country: "US", timezone: "America/Los_Angeles" },
        tokenFamily: { familyId: "fam-s1", tokensInFamily: 2, lastUsed: d("2026-01-05") },
        deviceInfo: { browser: "Chrome", type: "desktop" },
      });
      expect(out[1]).toMatchObject({ isCurrent: true, location: undefined, deviceInfo: { type: "mobile" } });
    });

    it("returns an empty list and treats a missing currentSessionId as no current", async () => {
      const { service, sessions } = build();
      sessions.find.mockResolvedValue([]);
      await expect(service.getActiveSessions("u", "t")).resolves.toEqual([]);
    });

    it("returns {} device info when the session has no user agent", async () => {
      const { service, sessions, tokens } = build();
      sessions.find.mockResolvedValue([{ id: "s", lastActivity: d("2026-01-01"), createdAt: d("2026-01-01") }]);
      tokens.find.mockResolvedValue([{ familyId: "f", createdAt: d("2026-01-01") }]);
      const [only] = await service.getActiveSessions("u", "t", "x");
      expect(only!.deviceInfo).toEqual({});
    });
  });

  it("getActiveSessionCount only counts non-revoked sessions for user+tenant", async () => {
    const { service, sessions } = build();
    sessions.count.mockResolvedValue(3);
    await expect(service.getActiveSessionCount("u", "t")).resolves.toBe(3);
    expect(sessions.count.mock.calls[0]![0].where).toMatchObject({ userId: "u", tenantId: "t" });
  });

  describe("revokeSession", () => {
    it("scopes the lookup to user and tenant, revokes session and tokens", async () => {
      const { service, sessions, oauth } = build();
      sessions.findOne.mockResolvedValue({ id: "s1", revokedAt: null });
      await service.revokeSession("s1", "u1", "t1");
      expect(sessions.findOne).toHaveBeenCalledWith({ where: { id: "s1", userId: "u1", tenantId: "t1" } });
      expect(sessions.update).toHaveBeenCalledWith(
        { id: "s1" },
        { revokedAt: expect.any(Date), revokedReason: "user_revoked" },
      );
      expect(oauth.revokeSessionTokens).toHaveBeenCalledWith("s1", "t1", "user_revoked");
    });

    it("rejects revoking someone else's / missing session (IDOR)", async () => {
      const { service, sessions, oauth } = build();
      sessions.findOne.mockResolvedValue(null);
      await expect(service.revokeSession("s1", "attacker", "t1")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      expect(sessions.update).not.toHaveBeenCalled();
      expect(oauth.revokeSessionTokens).not.toHaveBeenCalled();
    });

    it("is idempotent for an already revoked session", async () => {
      const { service, sessions, oauth } = build();
      sessions.findOne.mockResolvedValue({ id: "s1", revokedAt: new Date() });
      await expect(service.revokeSession("s1", "u1", "t1", "r")).resolves.toBeUndefined();
      expect(sessions.update).not.toHaveBeenCalled();
      expect(oauth.revokeSessionTokens).not.toHaveBeenCalled();
    });
  });

  describe("revokeAllOtherSessions", () => {
    it("keeps the current session and revokes the rest", async () => {
      const { service, sessions, oauth } = build();
      sessions.find.mockResolvedValue([{ id: "cur" }, { id: "a" }, { id: "b" }]);
      sessions.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, revokedAt: null }));
      await expect(service.revokeAllOtherSessions("u", "t", "cur")).resolves.toBe(2);
      expect(oauth.revokeSessionTokens.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
      expect(oauth.revokeSessionTokens.mock.calls[0]![2]).toBe("user_logout_other_devices");
    });

    it("returns 0 when only the current session exists", async () => {
      const { service, sessions } = build();
      sessions.find.mockResolvedValue([{ id: "cur" }]);
      await expect(service.revokeAllOtherSessions("u", "t", "cur")).resolves.toBe(0);
    });
  });

  describe("revokeAllUserSessions", () => {
    it("revokes sessions, wipes refresh hash, revokes tokens and reports affected rows", async () => {
      const { service, sessions, oauth } = build();
      sessions.update.mockResolvedValue({ affected: 4 });
      await expect(service.revokeAllUserSessions("u", "t")).resolves.toBe(4);
      const [criteria, patch] = sessions.update.mock.calls[0]!;
      expect(criteria).toMatchObject({ userId: "u", tenantId: "t" });
      expect(patch).toMatchObject({ revokedReason: "user_logout_all", refreshTokenHash: null });
      expect(oauth.revokeAllUserTokens).toHaveBeenCalledWith("u", "t", "user_logout_all");
    });

    it("defaults affected to 0 and honours a custom reason", async () => {
      const { service, sessions, oauth } = build();
      sessions.update.mockResolvedValue({});
      await expect(service.revokeAllUserSessions("u", "t", "pw_change")).resolves.toBe(0);
      expect(oauth.revokeAllUserTokens).toHaveBeenCalledWith("u", "t", "pw_change");
    });
  });

  describe("getSessionAnalytics", () => {
    it("breaks down only active sessions and finds the latest activity", async () => {
      const { service, sessions } = build();
      sessions.find.mockResolvedValue([
        { id: "1", userAgent: CHROME_MAC, ipAddress: "8.8.8.8", lastActivity: d("2026-01-02"), revokedAt: null },
        { id: "2", userAgent: CHROME_MAC, ipAddress: "8.8.4.4", lastActivity: d("2026-01-09"), revokedAt: null },
        { id: "3", userAgent: undefined, ipAddress: undefined, lastActivity: d("2026-01-05"), revokedAt: null },
        { id: "4", userAgent: IPHONE, ipAddress: "1.1.1.1", lastActivity: d("2026-02-01"), revokedAt: d("2026-02-02") },
      ]);
      lookup.mockReturnValue({ city: "x", country: "US", timezone: "tz" });
      const a = await service.getSessionAnalytics("u", "t");
      expect(a.totalSessions).toBe(4);
      expect(a.activeSessions).toBe(3);
      expect(a.revokedSessions).toBe(1);
      expect(a.lastActivity).toEqual(d("2026-01-09"));
      expect(a.deviceBreakdown["Unknown"]).toBe(1);
      expect(Object.values(a.deviceBreakdown).reduce((x, y) => x + y, 0)).toBe(3);
      expect(a.locationBreakdown).toEqual({ US: 2, Unknown: 1 });
    });

    it("returns null lastActivity and empty breakdowns with no active sessions", async () => {
      const { service, sessions } = build();
      sessions.find.mockResolvedValue([]);
      await expect(service.getSessionAnalytics("u", "t")).resolves.toEqual({
        totalSessions: 0,
        activeSessions: 0,
        revokedSessions: 0,
        deviceBreakdown: {},
        locationBreakdown: {},
        lastActivity: null,
      });
    });

    it("buckets geo hits without a country as Unknown", async () => {
      const { service, sessions } = build();
      sessions.find.mockResolvedValue([
        { id: "1", userAgent: CHROME_MAC, ipAddress: "8.8.8.8", lastActivity: d("2026-01-02"), revokedAt: null },
      ]);
      lookup.mockReturnValue({ city: "x", country: "", timezone: "tz" });
      expect((await service.getSessionAnalytics("u", "t")).locationBreakdown).toEqual({ Unknown: 1 });
    });
  });
});

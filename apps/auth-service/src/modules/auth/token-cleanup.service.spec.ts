import { Repository } from "typeorm";
import { Tenant } from "@repo/database";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { SessionManagementService } from "@/modules/session/session-management.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { TokenCleanupService } from "./token-cleanup.service";

const logInfo = jest.fn();
jest.mock("@/common/logger", () => ({
  logger: { info: (...a: unknown[]) => logInfo(...a), error: jest.fn(), warn: jest.fn() },
}));

type Summary = { tenantsFailed: number; tenantsProcessed: number };

function build() {
  const tokens = { cleanupExpiredTokens: jest.fn().mockResolvedValue(0) };
  const sessions = { cleanupExpiredSessions: jest.fn().mockResolvedValue({ sessionsCleanedUp: 0, tokensRevoked: 0 }) };
  const tenants = { find: jest.fn().mockResolvedValue([]) };
  const runner = { forEachActiveTenant: jest.fn() };
  const service = new TokenCleanupService(
    tokens as unknown as OAuthRefreshTokenService,
    sessions as unknown as SessionManagementService,
    tenants as unknown as Repository<Tenant>,
    runner as unknown as TenantJobRunner,
  );
  // silence Nest logger
  (service as unknown as { logger: Record<string, jest.Mock> }).logger = {
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { service, tokens, sessions, tenants, runner };
}

function runnerOver(
  runner: { forEachActiveTenant: jest.Mock },
  ids: string[],
  failIds: string[] = [],
): void {
  runner.forEachActiveTenant.mockImplementation(
    async (_name: string, fn: (t: { id: string }) => Promise<void>): Promise<Summary> => {
      let failed = 0;
      for (const id of ids) {
        try {
          await fn({ id });
          if (failIds.includes(id)) throw new Error("x");
        } catch {
          failed++;
        }
      }
      return { tenantsFailed: failed, tenantsProcessed: ids.length };
    },
  );
}

describe("TokenCleanupService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("dailyCleanup", () => {
    it("cleans each active tenant and keeps going when one fails", async () => {
      const { service, tokens, tenants } = build();
      tenants.find.mockResolvedValue([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ]);
      tokens.cleanupExpiredTokens
        .mockResolvedValueOnce(3)
        .mockRejectedValueOnce(new Error("db"))
        .mockResolvedValueOnce(0);
      await service.dailyCleanup();
      expect(tenants.find).toHaveBeenCalledWith({ where: { active: true }, select: ["id", "name"] });
      expect(tokens.cleanupExpiredTokens.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    });

    it("handles non-Error rejections", async () => {
      const { service, tokens, tenants } = build();
      tenants.find.mockResolvedValue([{ id: "a", name: "A" }]);
      tokens.cleanupExpiredTokens.mockRejectedValue("str");
      await expect(service.dailyCleanup()).resolves.toBeUndefined();
    });

    it("never throws if the tenant lookup fails", async () => {
      const { service, tenants, tokens } = build();
      tenants.find.mockRejectedValue(new Error("down"));
      await expect(service.dailyCleanup()).resolves.toBeUndefined();
      expect(tokens.cleanupExpiredTokens).not.toHaveBeenCalled();
      tenants.find.mockRejectedValue("weird");
      await expect(service.dailyCleanup()).resolves.toBeUndefined();
    });
  });

  describe("hourlyCleanup", () => {
    it("sums deletions across tenants and logs when something was deleted", async () => {
      const { service, tokens, runner } = build();
      runnerOver(runner, ["a", "b"]);
      tokens.cleanupExpiredTokens.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
      await service.hourlyCleanup();
      expect(runner.forEachActiveTenant).toHaveBeenCalledWith("token-cleanup-hourly", expect.any(Function));
      expect(logInfo).toHaveBeenCalledWith(expect.objectContaining({ deleted: 7 }), "Hourly token cleanup finished");
    });

    it("stays quiet when nothing happened", async () => {
      const { service, runner } = build();
      runnerOver(runner, ["a"]);
      await service.hourlyCleanup();
      expect(logInfo).not.toHaveBeenCalled();
    });

    it("logs when a tenant failed even if nothing was deleted", async () => {
      const { service, runner } = build();
      runnerOver(runner, ["a"], ["a"]);
      await service.hourlyCleanup();
      expect(logInfo).toHaveBeenCalledWith(expect.objectContaining({ tenantsFailed: 1 }), "Hourly token cleanup finished");
    });
  });

  describe("fifteenMinuteSessionCleanup", () => {
    it("runs inside the tenant runner and aggregates counts", async () => {
      const { service, sessions, runner } = build();
      runnerOver(runner, ["a", "b"]);
      sessions.cleanupExpiredSessions
        .mockResolvedValueOnce({ sessionsCleanedUp: 1, tokensRevoked: 2 })
        .mockResolvedValueOnce({ sessionsCleanedUp: 4, tokensRevoked: 0 });
      await service.fifteenMinuteSessionCleanup();
      expect(runner.forEachActiveTenant).toHaveBeenCalledWith("session-cleanup-15m", expect.any(Function));
      expect(logInfo).toHaveBeenCalledWith(
        expect.objectContaining({ sessionsCleanedUp: 5, tokensRevoked: 2 }),
        "15-minute session cleanup finished",
      );
    });

    it("is silent when idle and noisy on tenant failure", async () => {
      const a = build();
      runnerOver(a.runner, ["a"]);
      await a.service.fifteenMinuteSessionCleanup();
      expect(logInfo).not.toHaveBeenCalled();

      const b = build();
      runnerOver(b.runner, ["a"], ["a"]);
      await b.service.fifteenMinuteSessionCleanup();
      expect(logInfo).toHaveBeenCalled();
    });
  });

  describe("manualCleanup / getCleanupStats", () => {
    it("deletes for a specific tenant or globally", async () => {
      const { service, tokens } = build();
      tokens.cleanupExpiredTokens.mockResolvedValue(9);
      await expect(service.manualCleanup("t1")).resolves.toMatchObject({ deleted: 9, durationMs: expect.any(Number) });
      expect(tokens.cleanupExpiredTokens).toHaveBeenLastCalledWith("t1");
      await service.manualCleanup();
      expect(tokens.cleanupExpiredTokens).toHaveBeenLastCalledWith(undefined);
    });

    it("propagates manual cleanup errors", async () => {
      const { service, tokens } = build();
      tokens.cleanupExpiredTokens.mockRejectedValue(new Error("nope"));
      await expect(service.manualCleanup()).rejects.toThrow("nope");
    });

    it("returns zeroed stats", async () => {
      const { service } = build();
      await expect(service.getCleanupStats("t")).resolves.toEqual({
        expiredTokens: 0,
        usedTokens: 0,
        revokedTokens: 0,
        totalToCleanup: 0,
      });
    });
  });
});

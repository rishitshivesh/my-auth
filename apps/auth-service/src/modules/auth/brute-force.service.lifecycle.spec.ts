import { Repository } from "typeorm";
import { User, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { EmailService } from "@/modules/email/email.service";
import { BruteForceService } from "./brute-force.service";

const NOW = new Date("2026-05-01T12:00:00Z");

function build() {
  const repo = {
    save: jest.fn(async (u: User) => u),
    findOne: jest.fn(),
  };
  const events = { log: jest.fn() };
  const email = { sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new BruteForceService(
    repo as unknown as Repository<User>,
    events as unknown as SecurityEventService,
    email as unknown as EmailService,
  );
  return { service, repo, events, email };
}

const user = (o: Partial<User> = {}): User =>
  ({ id: "u1", tenantId: "t1", email: "a@b.com", failedLoginAttempts: 0, ...o }) as User;

describe("BruteForceService lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  describe("checkAccountLock", () => {
    it("pluralises minutes and rounds up", async () => {
      const { service } = build();
      const one = user({ lockedUntil: new Date(NOW.getTime() + 1) });
      await expect(service.checkAccountLock(one)).rejects.toMatchObject({
        code: "AUTH_ACCOUNT_LOCKED",
        detail: "Too many failed sign-in attempts. Try again in 1 minute.",
      });
      const many = user({ lockedUntil: new Date(NOW.getTime() + 61_000) });
      await expect(service.checkAccountLock(many)).rejects.toMatchObject({
        detail: expect.stringContaining("2 minutes"),
      });
    });

    it("treats lockedUntil == now as expired (boundary) and clears it", async () => {
      const { service, repo } = build();
      const u = user({ lockedUntil: new Date(NOW), failedLoginAttempts: 5 });
      await expect(service.checkAccountLock(u)).resolves.toBeUndefined();
      expect(u.lockedUntil).toBeUndefined();
      expect(repo.save).toHaveBeenCalledWith(u);
    });

    it("does nothing for an unlocked user", async () => {
      const { service, repo } = build();
      await service.checkAccountLock(user());
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("isLocked", () => {
    it("is true only while the lock is in the future", () => {
      const { service } = build();
      expect(service.isLocked(user({ lockedUntil: new Date(NOW.getTime() + 1) }))).toBe(true);
      expect(service.isLocked(user({ lockedUntil: new Date(NOW) }))).toBe(false);
      expect(service.isLocked(user())).toBe(false);
    });
  });

  describe("recordFailedAttempt", () => {
    it("increments from undefined/0, stamps lastFailedLogin and persists", async () => {
      const { service, repo, events } = build();
      const u = user({ failedLoginAttempts: undefined as unknown as number });
      await expect(service.recordFailedAttempt(u, "t1")).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
      expect(u.failedLoginAttempts).toBe(1);
      expect(u.lastFailedLogin).toEqual(NOW);
      expect(repo.save).toHaveBeenCalledWith(u);
      expect(events.log).not.toHaveBeenCalled();
    });

    it("emits a BRUTE_FORCE_THRESHOLD warning exactly on attempt 4 and does not lock", async () => {
      const { service, events, email } = build();
      const u = user({ failedLoginAttempts: 3 });
      await expect(service.recordFailedAttempt(u, "t1", "9.9.9.9")).rejects.toBeDefined();
      expect(u.lockedUntil).toBeUndefined();
      expect(events.log).toHaveBeenCalledTimes(1);
      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SecurityEventType.BRUTE_FORCE_THRESHOLD,
          severity: "warning",
          ipAddress: "9.9.9.9",
          userId: "u1",
          tenantId: "t1",
          metadata: { attempts: 4, maxAttempts: 5, attemptsUntilLock: 1 },
        }),
      );
      expect(email.sendAccountLockedEmail).not.toHaveBeenCalled();
    });

    it("locks on the 5th attempt for exactly 15 minutes, logs USER_LOCKED and mails the owner", async () => {
      const { service, events, email, repo } = build();
      const u = user({ failedLoginAttempts: 4 });
      await expect(service.recordFailedAttempt(u, "t1", "1.2.3.4")).rejects.toMatchObject({
        code: "AUTH_INVALID_CREDENTIALS",
        detail: undefined,
      });
      expect(u.lockedUntil).toEqual(new Date(NOW.getTime() + 15 * 60_000));
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SecurityEventType.USER_LOCKED,
          severity: "critical",
          ipAddress: "1.2.3.4",
        }),
      );
      expect(email.sendAccountLockedEmail).toHaveBeenCalledWith(u, 15, { ipAddress: "1.2.3.4" });
    });

    it("uses 0.0.0.0 when ip is unknown and keeps locking beyond the threshold", async () => {
      const { service, events } = build();
      const u = user({ failedLoginAttempts: 9 });
      await expect(service.recordFailedAttempt(u, "t1")).rejects.toBeDefined();
      expect(u.failedLoginAttempts).toBe(10);
      expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: "0.0.0.0", userAgent: "system" }));
      expect(u.lockedUntil).toBeDefined();
    });

    it("does not leak lock state: pre-lock and locking attempts yield identical error bodies", async () => {
      const a = build();
      const b = build();
      const e1 = await a.service.recordFailedAttempt(user({ failedLoginAttempts: 0 }), "t").catch((e: unknown) => e);
      const e2 = await b.service.recordFailedAttempt(user({ failedLoginAttempts: 4 }), "t").catch((e: unknown) => e);
      expect(JSON.stringify(e1)).toBe(JSON.stringify(e2));
    });
  });

  describe("resetFailedAttempts", () => {
    it("clears counters when there were failures or a lock", async () => {
      const { service, repo } = build();
      const u = user({ failedLoginAttempts: 2, lastFailedLogin: NOW });
      await service.resetFailedAttempts(u);
      expect(u).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null, lastFailedLogin: null });
      expect(repo.save).toHaveBeenCalledTimes(1);

      const locked = user({ lockedUntil: new Date(NOW.getTime() + 1000) });
      await service.resetFailedAttempts(locked);
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it("skips the write for a clean user", async () => {
      const { service, repo } = build();
      await service.resetFailedAttempts(user());
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("unlockAccount", () => {
    it("is tenant-scoped and clears lock state", async () => {
      const { service, repo } = build();
      const u = user({ lockedUntil: new Date(NOW.getTime() + 1000), failedLoginAttempts: 5 });
      repo.findOne.mockResolvedValue(u);
      await service.unlockAccount("u1", "t1");
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: "u1", tenantId: "t1" } });
      expect(u).toMatchObject({ lockedUntil: null, failedLoginAttempts: 0, lastFailedLogin: null });
      expect(repo.save).toHaveBeenCalledWith(u);
    });

    it("throws RESOURCE_NOT_FOUND for another tenant's / missing user", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue(null);
      await expect(service.unlockAccount("u1", "other")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("getAccountStatus", () => {
    it("reports a locked account", async () => {
      const { service, repo } = build();
      const lockedUntil = new Date(NOW.getTime() + 90_000);
      repo.findOne.mockResolvedValue(user({ failedLoginAttempts: 5, lockedUntil, lastFailedLogin: NOW }));
      await expect(service.getAccountStatus("u1", "t1")).resolves.toEqual({
        isLocked: true,
        failedAttempts: 5,
        maxAttempts: 5,
        attemptsRemaining: 0,
        lockedUntil,
        minutesUntilUnlock: 2,
        lastFailedLogin: NOW,
      });
    });

    it("reports an unlocked account and clamps remaining attempts at 0", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue(user({ failedLoginAttempts: 2 }));
      const s = await service.getAccountStatus("u1", "t1");
      expect(s).toMatchObject({ failedAttempts: 2, attemptsRemaining: 3, minutesUntilUnlock: 0 });
      expect(s.isLocked).toBeFalsy();

      repo.findOne.mockResolvedValue(user({ failedLoginAttempts: 12 }));
      expect((await service.getAccountStatus("u1", "t1")).attemptsRemaining).toBe(0);

      repo.findOne.mockResolvedValue(user({ failedLoginAttempts: undefined as unknown as number }));
      expect((await service.getAccountStatus("u1", "t1")).failedAttempts).toBe(0);
    });

    it("throws RESOURCE_NOT_FOUND when missing", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue(null);
      await expect(service.getAccountStatus("x", "t1")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    });
  });
});

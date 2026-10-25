import { Repository } from "typeorm";
import { User } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { EmailService } from "@/modules/email/email.service";
import { ApiException } from "@/common/http";
import { BruteForceService } from "./brute-force.service";

function build() {
  const userRepository = { save: jest.fn(async (u: User) => u) } as unknown as Repository<User>;
  const securityEvents = { log: jest.fn() } as unknown as SecurityEventService;
  const email = { sendAccountLockedEmail: jest.fn() } as unknown as EmailService;
  return { service: new BruteForceService(userRepository, securityEvents, email), userRepository, email };
}

const user = (overrides: Partial<User> = {}): User =>
  ({ id: "u1", email: "a@b.com", failedLoginAttempts: 0, ...overrides }) as User;

describe("BruteForceService", () => {
  it("checkAccountLock throws AUTH_ACCOUNT_LOCKED while locked", async () => {
    const { service } = build();
    const locked = user({ lockedUntil: new Date(Date.now() + 5 * 60_000) });
    await expect(service.checkAccountLock(locked)).rejects.toMatchObject({ code: "AUTH_ACCOUNT_LOCKED" });
  });

  it("checkAccountLock clears an expired lock and resets the counter", async () => {
    const { service, userRepository } = build();
    const expired = user({ lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 5 });
    await service.checkAccountLock(expired);
    expect(expired.failedLoginAttempts).toBe(0);
    expect(userRepository.save).toHaveBeenCalled();
  });

  it("a failed attempt answers AUTH_INVALID_CREDENTIALS and reveals no attempt count", async () => {
    const { service } = build();
    const err = await service.recordFailedAttempt(user(), "t1", "1.1.1.1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe("AUTH_INVALID_CREDENTIALS");
    expect((err as ApiException).detail).toBeUndefined();
  });

  it("the attempt that locks the account is still answered as invalid credentials, and emails the owner", async () => {
    const { service, email } = build();
    const nearlyLocked = user({ failedLoginAttempts: 4 });
    await expect(service.recordFailedAttempt(nearlyLocked, "t1", "1.1.1.1")).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(nearlyLocked.lockedUntil).toBeInstanceOf(Date);
    expect(email.sendAccountLockedEmail).toHaveBeenCalled();
  });

  it("isLocked is false once the lock has expired", () => {
    const { service } = build();
    expect(service.isLocked(user({ lockedUntil: new Date(Date.now() - 1) }))).toBe(false);
  });

  it("uses the tenant's lockout threshold and duration when a policy exists", async () => {
    const userRepository = { save: jest.fn(async (u: User) => u) } as unknown as Repository<User>;
    const email = { sendAccountLockedEmail: jest.fn() } as unknown as EmailService;
    const policy = { get: jest.fn().mockResolvedValue({ lockoutThreshold: 3, lockoutDurationMinutes: 30 }) };
    const service = new BruteForceService(userRepository, { log: jest.fn() } as unknown as SecurityEventService, email, policy as never);
    const u = user({ failedLoginAttempts: 2 });
    const before = Date.now();
    await expect(service.recordFailedAttempt(u, "t1")).rejects.toBeDefined();
    expect(policy.get).toHaveBeenCalledWith("t1");
    expect(u.lockedUntil!.getTime() - before).toBeGreaterThanOrEqual(30 * 60 * 1000 - 50);
    expect(email.sendAccountLockedEmail).toHaveBeenCalledWith(u, 30, expect.anything());
  });
});

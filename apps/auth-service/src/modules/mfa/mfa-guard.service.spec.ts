import { MfaGuardService, CHALLENGE_MAX_ATTEMPTS } from "./mfa-guard.service";
import { createFakeRedis } from "./fake-redis";

describe("MfaGuardService", () => {
  let guard: MfaGuardService;

  beforeEach(() => {
    guard = new MfaGuardService(createFakeRedis());
  });

  it("lets a TOTP time step be spent once only", async () => {
    expect(await guard.claimTotpStep("t1", "u1", 100)).toBe(true);
    expect(await guard.claimTotpStep("t1", "u1", 100)).toBe(false);
    expect(await guard.claimTotpStep("t1", "u1", 101)).toBe(true);
  });

  it("keeps spent steps separate per user", async () => {
    await guard.claimTotpStep("t1", "u1", 100);
    expect(await guard.claimTotpStep("t1", "u2", 100)).toBe(true);
  });

  it("rejects wrong codes with AUTH_MFA_INVALID, then voids the challenge", async () => {
    for (let i = 0; i < CHALLENGE_MAX_ATTEMPTS; i++) {
      await guard.assertChallengeActive("t1", "c1");
      await expect(guard.rejectWrongCode("t1", "c1")).rejects.toMatchObject({
        code: "AUTH_MFA_INVALID",
      });
    }
    await expect(guard.assertChallengeActive("t1", "c1")).rejects.toMatchObject({
      code: "AUTH_TOKEN_EXPIRED",
    });
  });

  it("does not void other challenges", async () => {
    for (let i = 0; i < CHALLENGE_MAX_ATTEMPTS; i++) {
      await guard.rejectWrongCode("t1", "c1").catch(() => undefined);
    }
    await expect(guard.assertChallengeActive("t1", "c2")).resolves.toBeUndefined();
  });

  it("lets a recovery code be claimed once", async () => {
    expect(await guard.claimRecoveryCode("t1", "u1", "abc")).toBe(true);
    expect(await guard.claimRecoveryCode("t1", "u1", "abc")).toBe(false);
  });
});

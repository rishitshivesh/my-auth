import { TenantPasswordPolicyService, PLATFORM_PASSWORD_POLICY, assertTenantPasswordPolicy, passwordExpired } from "./tenant-password-policy.service";

function build(row: Record<string, unknown> | null = null) {
  const repo = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (x: unknown) => x) };
  return { repo, svc: new TenantPasswordPolicyService(repo as never) };
}
const GOOD = "correct-horse-battery-staple";

describe("TenantPasswordPolicyService", () => {
  it("returns platform defaults when the tenant has no row", async () => {
    expect(await build().svc.get("t")).toEqual(PLATFORM_PASSWORD_POLICY);
  });

  it("never reports a minimum below the platform floor", async () => {
    const { svc } = build({ minLength: 6, requireCommonPasswordCheck: true, historyCount: 1, maxAgeDays: 0, lockoutThreshold: 5, lockoutDurationMinutes: 15 });
    expect((await svc.get("t")).minLength).toBe(12);
  });

  it("merges updates over the current policy and saves one row per tenant", async () => {
    const { svc, repo } = build();
    const out = await svc.update("t", { minLength: 16, maxAgeDays: 90 });
    expect(out).toEqual({ ...PLATFORM_PASSWORD_POLICY, minLength: 16, maxAgeDays: 90 });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", minLength: 16, maxAgeDays: 90 }));
  });

  it("enforces the tenant's stricter minimum length", async () => {
    const { svc } = build({ minLength: 20, requireCommonPasswordCheck: true, historyCount: 5, maxAgeDays: 0, lockoutThreshold: 5, lockoutDurationMinutes: 15 });
    await expect(svc.assert("t", GOOD.slice(0, 15))).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    await expect(svc.assert("t", GOOD)).resolves.toBeUndefined();
  });

  it("skips the common-password check when the tenant turns it off, keeps it on by default", async () => {
    const common = "password1234";
    await expect(build().svc.assert("t", common)).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    const off = build({ minLength: 12, requireCommonPasswordCheck: false, historyCount: 5, maxAgeDays: 0, lockoutThreshold: 5, lockoutDurationMinutes: 15 });
    await expect(off.svc.assert("t", common)).resolves.toBeUndefined();
  });

  it("assertTenantPasswordPolicy falls back to platform rules without the service", async () => {
    await expect(assertTenantPasswordPolicy(undefined, "t", "short")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    await expect(assertTenantPasswordPolicy(undefined, "t", GOOD)).resolves.toBeUndefined();
  });

  it("passwordExpired honours maxAgeDays (0 = never)", () => {
    const now = new Date("2026-01-31T00:00:00Z");
    expect(passwordExpired({ maxAgeDays: 0 }, new Date("2020-01-01"), now)).toBe(false);
    expect(passwordExpired({ maxAgeDays: 30 }, new Date("2026-01-10"), now)).toBe(false);
    expect(passwordExpired({ maxAgeDays: 30 }, new Date("2025-12-01"), now)).toBe(true);
    expect(passwordExpired({ maxAgeDays: 30 }, null, now)).toBe(false);
  });
});

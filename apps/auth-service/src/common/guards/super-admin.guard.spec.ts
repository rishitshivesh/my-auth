import type { ExecutionContext } from "@nestjs/common";
import { SuperAdminGuard } from "./super-admin.guard";

const ctx = (user?: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe("SuperAdminGuard", () => {
  const guard = new SuperAdminGuard();

  it("allows a platform administrator", () => {
    expect(guard.canActivate(ctx({ isSuperAdmin: true }))).toBe(true);
  });

  it("rejects a missing user as an invalid token (guard ordering safety)", () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(expect.objectContaining({ code: "AUTH_TOKEN_INVALID" }));
  });

  it.each([[{}], [{ isSuperAdmin: false }], [{ isSuperAdmin: undefined }], [{ isSuperAdmin: "true" }], [{ isSuperAdmin: 1 }]])(
    "forbids %j (only a literal true passes)",
    (user) => {
      expect(() => guard.canActivate(ctx(user))).toThrow(expect.objectContaining({ code: "ACCESS_FORBIDDEN" }));
    },
  );
});

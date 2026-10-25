import { ExecutionContext } from "@nestjs/common";
import { ApiException } from "../http";
import { TenantBindingGuard } from "./tenant-binding.guard";

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiException ? e.code : "NOT_API_EXCEPTION";
  }
  return undefined;
}

describe("TenantBindingGuard", () => {
  const guard = new TenantBindingGuard();

  it("allows when token tenant equals request tenant", () => {
    expect(guard.canActivate(ctx({ tenantId: "t1", user: { sub: "u", tenantId: "t1" } }))).toBe(true);
  });

  it("denies with ACCESS_FORBIDDEN when request has no tenant", () => {
    expect(codeOf(() => guard.canActivate(ctx({ user: { tenantId: "t1" } })))).toBe("ACCESS_FORBIDDEN");
  });

  it("denies with AUTH_TOKEN_INVALID when no user", () => {
    expect(codeOf(() => guard.canActivate(ctx({ tenantId: "t1" })))).toBe("AUTH_TOKEN_INVALID");
  });

  it("denies with TENANT_MISMATCH when token has no tenantId", () => {
    expect(codeOf(() => guard.canActivate(ctx({ tenantId: "t1", user: { sub: "u" } })))).toBe("TENANT_MISMATCH");
  });

  it("denies cross-tenant token reuse", () => {
    const req = { tenantId: "t1", user: { sub: "u", tenantId: "t2" }, ip: "1.1.1.1", path: "/x" };
    expect(codeOf(() => guard.canActivate(ctx(req)))).toBe("TENANT_MISMATCH");
  });

  it("treats tenant ids case-sensitively and without coercion", () => {
    expect(codeOf(() => guard.canActivate(ctx({ tenantId: "T1", user: { tenantId: "t1" } })))).toBe("TENANT_MISMATCH");
    expect(codeOf(() => guard.canActivate(ctx({ tenantId: "t1 ", user: { tenantId: "t1" } })))).toBe("TENANT_MISMATCH");
  });

  it("lets superadmin bypass a mismatched tenant", () => {
    const req = { tenantId: "t1", user: { tenantId: "t2", isSuperAdmin: true, email: "a@b.c" } };
    expect(guard.canActivate(ctx(req))).toBe(true);
  });

  it("still requires tenantId on the token for superadmins", () => {
    const req = { tenantId: "t1", user: { isSuperAdmin: true } };
    expect(codeOf(() => guard.canActivate(ctx(req)))).toBe("TENANT_MISMATCH");
  });
});

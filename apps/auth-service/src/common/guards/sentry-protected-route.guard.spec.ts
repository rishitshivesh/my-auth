import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SentryProtectedGuard } from "./sentry-protected-route.guard";
import { TenantBindingGuard } from "./tenant-binding.guard";
import { JwtAuthGuard } from "@/common/guards/jwt-auth-guard";
import { SessionGuard } from "@/common/guards/session.guard";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";

describe("SentryProtectedGuard", () => {
  const handler = (): void => undefined;
  const context = { getHandler: () => handler } as unknown as ExecutionContext;
  const order: string[] = [];

  function make(results: { jwt?: boolean; tenant?: boolean; session?: boolean; perm?: boolean }, permissions?: string[]) {
    order.length = 0;
    const mk = (name: string, v: boolean) => ({
      canActivate: jest.fn(() => {
        order.push(name);
        return v;
      }),
    });
    const jwt = mk("jwt", results.jwt ?? true);
    const tenant = mk("tenant", results.tenant ?? true);
    const session = mk("session", results.session ?? true);
    const perm = mk("perm", results.perm ?? true);
    const reflector = { get: jest.fn().mockReturnValue(permissions) } as unknown as Reflector;
    const guard = new SentryProtectedGuard(
      reflector,
      jwt as unknown as JwtAuthGuard,
      tenant as unknown as TenantBindingGuard,
      session as unknown as SessionGuard,
      perm as unknown as PermissionsGuard,
    );
    return { guard, jwt, tenant, session, perm, reflector };
  }

  it("runs jwt, tenant, session in order and skips permissions without decorator", async () => {
    const { guard, perm } = make({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(order).toEqual(["jwt", "tenant", "session"]);
    expect(perm.canActivate).not.toHaveBeenCalled();
  });

  it("skips permissions for an empty permission list", async () => {
    const { guard, perm } = make({}, []);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(perm.canActivate).not.toHaveBeenCalled();
  });

  it("short-circuits on jwt failure", async () => {
    const { guard, tenant } = make({ jwt: false });
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(tenant.canActivate).not.toHaveBeenCalled();
  });

  it("short-circuits on tenant failure", async () => {
    const { guard, session } = make({ tenant: false });
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(session.canActivate).not.toHaveBeenCalled();
  });

  it("short-circuits on session failure", async () => {
    const { guard, perm } = make({ session: false }, ["users:read"]);
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(perm.canActivate).not.toHaveBeenCalled();
  });

  it("evaluates permissions last when decorator present", async () => {
    const { guard, reflector } = make({}, ["users:read"]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(order).toEqual(["jwt", "tenant", "session", "perm"]);
    expect(reflector.get).toHaveBeenCalledWith("permissions", handler);
  });

  it("denies when permissions guard denies", async () => {
    const { guard } = make({ perm: false }, ["users:read"]);
    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("propagates exceptions thrown by sub-guards", async () => {
    const { guard, jwt } = make({});
    jwt.canActivate.mockImplementation(() => {
      throw new Error("bad token");
    });
    await expect(guard.canActivate(context)).rejects.toThrow("bad token");
  });
});

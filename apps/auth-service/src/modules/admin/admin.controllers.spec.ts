import { AdminController } from "./admin.controller";
import { AdminCleanupController } from "./admin-cleanup.controller";
import { SuperadminSetupController } from "./superadmin-setup.controller";

jest.mock("@/common/http/auth-cookies", () => ({ setAuthCookies: jest.fn(), ACCESS_TOKEN_TTL_SECONDS: 900 }));
import { setAuthCookies } from "@/common/http/auth-cookies";

describe("AdminController", () => {
  const build = () => {
    const svc = {
      getPlatformMetrics: jest.fn(), listTenants: jest.fn(), checkSlugAvailability: jest.fn(), getTenantById: jest.fn(),
      createTenant: jest.fn(), updateTenant: jest.fn(), deleteTenant: jest.fn().mockResolvedValue(undefined), getRecentActivity: jest.fn(),
      getTeamMembers: jest.fn(), addTeamMember: jest.fn(), removeTeamMember: jest.fn().mockResolvedValue(undefined),
      getPlatformSettings: jest.fn(), updatePlatformSettings: jest.fn(),
    };
    return { c: new AdminController(svc as never), svc };
  };

  it("listTenants parses paging, defaults and caps limit at 100", async () => {
    const { c, svc } = build();
    await c.listTenants("s", "active", "pro", "2", "500");
    await c.listTenants();
    expect(svc.listTenants).toHaveBeenNthCalledWith(1, { search: "s", status: "active", plan: "pro", page: 2, limit: 100 });
    expect(svc.listTenants).toHaveBeenNthCalledWith(2, { search: undefined, status: undefined, plan: undefined, page: 1, limit: 20 });
  });

  it("activity limit is capped at 100 with default 20", async () => {
    const { c, svc } = build();
    await c.getActivity("1000");
    await c.getActivity();
    expect(svc.getRecentActivity).toHaveBeenNthCalledWith(1, 100);
    expect(svc.getRecentActivity).toHaveBeenNthCalledWith(2, 20);
  });

  it("checkSlug coerces missing slug to empty string", async () => {
    const { c, svc } = build();
    await c.checkSlug(undefined as never);
    expect(svc.checkSlugAvailability).toHaveBeenCalledWith("");
  });

  it("createTenant only passes the caller as admin when requested", async () => {
    const { c, svc } = build();
    await c.createTenant({ user: { sub: "me" } }, { name: "n", slug: "slug", useCurrentUserAsAdmin: true } as never);
    await c.createTenant({ user: { sub: "me" } }, { name: "n", slug: "slug" } as never);
    await c.createTenant({}, { name: "n", slug: "slug", useCurrentUserAsAdmin: true } as never);
    expect(svc.createTenant.mock.calls.map((x) => x[0].currentUserId)).toEqual(["me", undefined, undefined]);
  });

  it("delegates remaining endpoints", async () => {
    const { c, svc } = build();
    await c.getPlatformMetrics(); await c.getTenant("1"); await c.updateTenant("1", { name: "x" } as never);
    await c.deleteTenant("1"); await c.getTeam(); await c.addTeamMember({ email: "a@x" } as never);
    await c.removeTeamMember("u"); await c.getSettings(); await c.updateSettings({ maintenanceMode: true } as never);
    expect(svc.getTenantById).toHaveBeenCalledWith("1");
    expect(svc.updateTenant).toHaveBeenCalledWith("1", { name: "x" });
    expect(svc.deleteTenant).toHaveBeenCalledWith("1");
    expect(svc.addTeamMember).toHaveBeenCalledWith("a@x");
    expect(svc.removeTeamMember).toHaveBeenCalledWith("u");
    expect(svc.updatePlatformSettings).toHaveBeenCalledWith({ maintenanceMode: true });
    expect(svc.getPlatformMetrics).toHaveBeenCalled();
    expect(svc.getTeamMembers).toHaveBeenCalled();
    expect(svc.getPlatformSettings).toHaveBeenCalled();
  });
});

describe("AdminCleanupController", () => {
  it("wraps cleanup result and forwards tenant filter", async () => {
    const cleanup = { manualCleanup: jest.fn().mockResolvedValue({ removed: 3 }), getCleanupStats: jest.fn().mockResolvedValue({ n: 1 }) };
    const c = new AdminCleanupController(cleanup as never);
    expect(await c.triggerCleanup("t1")).toEqual({ message: "Token cleanup completed", removed: 3 });
    expect(cleanup.manualCleanup).toHaveBeenCalledWith("t1");
    expect(await c.getCleanupStats()).toEqual({ n: 1 });
    expect(cleanup.getCleanupStats).toHaveBeenCalledWith(undefined);
  });
});

describe("SuperadminSetupController", () => {
  const build = () => {
    const svc = {
      getPlatformInfo: jest.fn().mockResolvedValue({ slug: "s", name: "n", initialized: false }),
      isInitialized: jest.fn(), getSetupLogPath: jest.fn(), createFirstAdmin: jest.fn(),
    };
    return { c: new SuperadminSetupController(svc as never), svc };
  };

  it("platform-info and initialized", async () => {
    const { c, svc } = build();
    expect(await c.getPlatformInfo()).toEqual({ slug: "s", name: "n", initialized: false });
    svc.isInitialized.mockResolvedValue(true);
    expect(await c.checkInitialized()).toEqual({ initialized: true });
  });

  it("setup-log-hint never reveals the path, only a generic hint", () => {
    const { c } = build();
    const out = c.getSetupLogHint();
    expect(out.path).toBeNull();
    expect(out.hint).toMatch(/SENTRY_SETUP_LOG_DIR/);
  });

  // superadmin-setup.controller.ts: @Public() setup-log-hint discloses the server filesystem path of the secret setup token file to anyone.
  it("does not disclose the setup token file path to unauthenticated callers", () => {
    const { c, svc } = build();
    svc.getSetupLogPath.mockReturnValue("/home/app/.sentry/setup.log");
    expect(c.getSetupLogHint().path).toBeNull();
  });

  it("createFirstAdmin passes token/ip/ua, sets cookies, and never returns tokens in body", async () => {
    const { c, svc } = build();
    svc.createFirstAdmin.mockResolvedValue({ accessToken: "A", refreshToken: "R", user: { id: "u", email: "e", name: "n" } });
    const res = {} as never;
    const out = await c.createFirstAdmin({ email: "e" } as never, res, "1.2.3.4", "ua", "TOK");
    expect(svc.createFirstAdmin).toHaveBeenCalledWith({ email: "e" }, "TOK", "1.2.3.4", "ua");
    expect(setAuthCookies).toHaveBeenCalledWith(res, "A", "R");
    expect(out).toEqual({ user: { id: "u", email: "e", name: "n" }, expiresIn: 900 });
    expect(JSON.stringify(out)).not.toMatch(/"A"|"R"/);
  });

  it("defaults missing header/ip values", async () => {
    const { c, svc } = build();
    svc.createFirstAdmin.mockResolvedValue({ accessToken: "A", refreshToken: "R", user: {} });
    await c.createFirstAdmin({} as never, {} as never, undefined as never, undefined as never, undefined as never);
    expect(svc.createFirstAdmin).toHaveBeenCalledWith({}, "", "0.0.0.0", "unknown");
  });
});

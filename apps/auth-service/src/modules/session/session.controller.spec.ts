import { RequestMethod } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { SessionManagementService } from "./session-management.service";
import { SessionController } from "./session.controller";

function build() {
  const svc = {
    getActiveSessions: jest.fn().mockResolvedValue([{ id: "s" }]),
    getSessionAnalytics: jest.fn().mockResolvedValue({ totalSessions: 1 }),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    revokeAllOtherSessions: jest.fn().mockResolvedValue(3),
    revokeAllUserSessions: jest.fn().mockResolvedValue(5),
  };
  return { svc, ctl: new SessionController(svc as unknown as SessionManagementService) };
}

const req = (sessionId?: string) => ({ tenantId: "t1", user: { sub: "u1", sessionId } });

describe("SessionController", () => {
  it("lists active sessions for the caller's own user/tenant/session", async () => {
    const { ctl, svc } = build();
    await expect(ctl.getActiveSessions(req("s9"))).resolves.toEqual([{ id: "s" }]);
    expect(svc.getActiveSessions).toHaveBeenCalledWith("u1", "t1", "s9");
  });

  it("falls back to an empty current session id", async () => {
    const { ctl, svc } = build();
    await ctl.getActiveSessions(req());
    expect(svc.getActiveSessions).toHaveBeenCalledWith("u1", "t1", "");
  });

  it("returns analytics scoped to the caller", async () => {
    const { ctl, svc } = build();
    await expect(ctl.getSessionAnalytics(req())).resolves.toEqual({ totalSessions: 1 });
    expect(svc.getSessionAnalytics).toHaveBeenCalledWith("u1", "t1");
  });

  it("revokes a session with the caller's identity (not a client-supplied user)", async () => {
    const { ctl, svc } = build();
    await expect(ctl.revokeSession("victim-sess", req())).resolves.toEqual({ message: "Session revoked successfully" });
    expect(svc.revokeSession).toHaveBeenCalledWith("victim-sess", "u1", "t1", "user_revoked_via_api");
  });

  it("propagates not-found from revokeSession", async () => {
    const { ctl, svc } = build();
    svc.revokeSession.mockRejectedValue(new Error("nf"));
    await expect(ctl.revokeSession("x", req())).rejects.toThrow("nf");
  });

  it("revokes all other sessions", async () => {
    const { ctl, svc } = build();
    await expect(ctl.revokeAllOtherSessions(req("cur"))).resolves.toEqual({
      message: "All other sessions revoked",
      revokedCount: 3,
    });
    expect(svc.revokeAllOtherSessions).toHaveBeenCalledWith("u1", "t1", "cur");
    await ctl.revokeAllOtherSessions(req());
    expect(svc.revokeAllOtherSessions).toHaveBeenLastCalledWith("u1", "t1", "");
  });

  it("revokes all sessions", async () => {
    const { ctl, svc } = build();
    await expect(ctl.revokeAllSessions(req())).resolves.toEqual({ message: "All sessions revoked", revokedCount: 5 });
    expect(svc.revokeAllUserSessions).toHaveBeenCalledWith("u1", "t1", "user_logout_all_via_api");
  });

  describe("route table", () => {
    const proto = SessionController.prototype as unknown as Record<string, unknown>;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== "constructor")
      .map((n) => ({
        name: n,
        path: Reflect.getMetadata(PATH_METADATA, proto[n] as object) as string,
        method: Reflect.getMetadata(METHOD_METADATA, proto[n] as object) as RequestMethod,
      }));

    it("exposes the expected routes", () => {
      expect(routes.map((r) => `${RequestMethod[r.method]} ${r.path}`).sort()).toEqual(
        ["DELETE :sessionId", "DELETE all", "DELETE all/other", "GET active", "GET analytics"].sort(),
      );
    });

    // Static routes must precede ":sessionId" or Express matches /sessions/all as a session id.
    it("declares static DELETE routes before the :sessionId param route", () => {
      const del = routes.filter((r) => r.method === RequestMethod.DELETE).map((r) => r.path);
      expect(del.indexOf("all")).toBeLessThan(del.indexOf(":sessionId"));
    });
  });
});

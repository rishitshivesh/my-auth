import { ScimController } from "./scim.controller";

function build() {
  const svc = {
    listUsers: jest.fn(), getUser: jest.fn(), createUser: jest.fn(), replaceUser: jest.fn(), patchUser: jest.fn(),
    deleteUser: jest.fn(), listGroups: jest.fn(), getGroup: jest.fn(), createGroup: jest.fn(), patchGroup: jest.fn(),
    deleteGroup: jest.fn(),
  };
  const tokens = { createToken: jest.fn(), listTokens: jest.fn(), revokeToken: jest.fn() };
  const req = { scimTenantId: "t1", protocol: "https", get: (h: string) => (h === "host" ? "sentry.test" : undefined) } as never;
  return { c: new ScimController(svc as never, tokens as never), svc, tokens, req };
}
const BASE = "https://sentry.test";
const jwtReq = { tenantId: "t1", user: { sub: "u", tid: "t1" } };

describe("ScimController", () => {
  it("token management delegates with tenant from JWT request", () => {
    const { c, tokens } = build();
    c.createToken(jwtReq, { name: "n", expiresInDays: 5 });
    c.listTokens(jwtReq);
    c.revokeToken(jwtReq, "id");
    expect(tokens.createToken).toHaveBeenCalledWith("t1", "n", 5);
    expect(tokens.listTokens).toHaveBeenCalledWith("t1");
    expect(tokens.revokeToken).toHaveBeenCalledWith("t1", "id");
  });

  it("listUsers parses paging with defaults and passes filter", () => {
    const { c, svc, req } = build();
    c.listUsers(req, "5", "20", 'userName eq "a"');
    c.listUsers(req);
    expect(svc.listUsers).toHaveBeenNthCalledWith(1, "t1", BASE, 5, 20, 'userName eq "a"');
    expect(svc.listUsers).toHaveBeenNthCalledWith(2, "t1", BASE, 1, 100, undefined);
  });

  it("user and group endpoints use the SCIM-token tenant and request base URL", () => {
    const { c, svc, req } = build();
    const user = { schemas: [], userName: "a" };
    c.getUser(req, "u");
    c.createUser(req, user as never);
    c.replaceUser(req, "u", user as never);
    c.patchUser(req, "u", { schemas: [], Operations: [{ op: "add" }] });
    c.deleteUser(req, "u");
    c.getGroup(req, "g");
    c.createGroup(req, { displayName: "G" } as never);
    c.patchGroup(req, "g", { schemas: [], Operations: [] });
    c.deleteGroup(req, "g");
    c.listGroups(req, "2", "3");
    c.listGroups(req);
    expect(svc.getUser).toHaveBeenCalledWith("t1", "u", BASE);
    expect(svc.createUser).toHaveBeenCalledWith("t1", user, BASE);
    expect(svc.replaceUser).toHaveBeenCalledWith("t1", "u", user, BASE);
    expect(svc.patchUser).toHaveBeenCalledWith("t1", "u", [{ op: "add" }], BASE);
    expect(svc.deleteUser).toHaveBeenCalledWith("t1", "u");
    expect(svc.getGroup).toHaveBeenCalledWith("t1", "g", BASE);
    expect(svc.createGroup).toHaveBeenCalledWith("t1", { displayName: "G" }, BASE);
    expect(svc.patchGroup).toHaveBeenCalledWith("t1", "g", [], BASE);
    expect(svc.deleteGroup).toHaveBeenCalledWith("t1", "g");
    expect(svc.listGroups).toHaveBeenNthCalledWith(1, "t1", BASE, 2, 3);
    expect(svc.listGroups).toHaveBeenNthCalledWith(2, "t1", BASE, 1, 100);
  });

  it("serviceProviderConfig advertises patch, no bulk", () => {
    const cfg = build().c.serviceProviderConfig();
    expect(cfg.patch.supported).toBe(true);
    expect(cfg.bulk.supported).toBe(false);
    expect(cfg.authenticationSchemes[0]?.type).toBe("oauthbearertoken");
  });
});

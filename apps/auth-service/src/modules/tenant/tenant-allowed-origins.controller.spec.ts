import "reflect-metadata";
import { PERMISSIONS_KEY } from "@/modules/rbac/guards/permissions.guard";
import { TenantAllowedOriginsController } from "./tenant-allowed-origins.controller";

jest.mock("@/common/decorators/protected.decorator", () => ({ Protected: () => () => undefined }));

describe("TenantAllowedOriginsController", () => {
  const req = { tenantId: "t1", user: { sub: "u1", email: "a@b.c" }, ip: "1.1.1.1", headers: { "user-agent": "UA" } };
  function build(current: string[] = ["https://old.example.com"]) {
    const svc = {
      get: jest.fn().mockResolvedValue({ origins: current }),
      replace: jest.fn((_t: string, o: string[]) => Promise.resolve({ origins: o })),
    };
    const events = { log: jest.fn() };
    return { svc, events, c: new TenantAllowedOriginsController(svc as never, events as never) };
  }

  it("get returns the caller's tenant list only", async () => {
    const b = build();
    expect(await b.c.get(req)).toEqual({ origins: ["https://old.example.com"] });
    expect(b.svc.get).toHaveBeenCalledWith("t1");
  });

  it("replace saves for the caller's tenant and audits added/removed origins", async () => {
    const b = build();
    await b.c.replace(req, { origins: ["https://new.example.com"] });
    expect(b.svc.replace).toHaveBeenCalledWith("t1", ["https://new.example.com"]);
    expect(b.events.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        userId: "u1",
        resourceType: "allowed_origins",
        metadata: { added: ["https://new.example.com"], removed: ["https://old.example.com"] },
      }),
    );
  });

  it("requires tenant:read for GET and tenant:write for PUT", () => {
    const proto = TenantAllowedOriginsController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.get)).toEqual(["tenant:read"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.replace)).toEqual(["tenant:write"]);
  });
});

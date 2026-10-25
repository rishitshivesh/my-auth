import "reflect-metadata";
import { PERMISSIONS_KEY } from "@/modules/rbac/guards/permissions.guard";
import { TenantPasswordPolicyController } from "./tenant-password-policy.controller";

jest.mock("@/common/decorators/protected.decorator", () => ({ Protected: () => () => undefined }));

describe("TenantPasswordPolicyController", () => {
  const req = { tenantId: "t1", user: { sub: "u1", email: "a@b.c" }, ip: "1.1.1.1", headers: { "user-agent": "UA" } };
  function build() {
    const policy = { get: jest.fn().mockResolvedValue({ minLength: 12 }), update: jest.fn().mockResolvedValue({ minLength: 16 }) };
    const events = { log: jest.fn() };
    return { policy, events, c: new TenantPasswordPolicyController(policy as never, events as never) };
  }

  it("get returns the effective policy for the caller's tenant", async () => {
    const b = build();
    expect(await b.c.get(req)).toEqual({ minLength: 12 });
    expect(b.policy.get).toHaveBeenCalledWith("t1");
  });

  it("update saves and writes an audit event", async () => {
    const b = build();
    expect(await b.c.update(req, { minLength: 16 })).toEqual({ minLength: 16 });
    expect(b.policy.update).toHaveBeenCalledWith("t1", { minLength: 16 });
    expect(b.events.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", userId: "u1", resourceType: "password_policy" }));
  });

  it("requires tenant:read for GET and tenant:write for PUT", () => {
    const proto = TenantPasswordPolicyController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.get)).toEqual(["tenant:read"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.update)).toEqual(["tenant:write"]);
  });
});

import "reflect-metadata";
import { WebhookController } from "./webhook.controller";
import { PERMISSIONS_KEY } from "@/modules/rbac/guards/permissions.guard";

jest.mock("@/common/guards", () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock("@/common/guards/session.guard", () => ({ SessionGuard: class SessionGuard {} }));

function build() {
  const svc = {
    create: jest.fn(),
    list: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    rotateSecret: jest.fn(),
    delete: jest.fn(),
    getDeliveries: jest.fn(),
    redeliver: jest.fn(),
    sendTestEvent: jest.fn(),
  };
  return { svc, c: new WebhookController(svc as never) };
}
const req = { tenantId: "t1", user: { sub: "u", tid: "t1" } };

describe("WebhookController", () => {
  it("scopes every write route to the request tenant", () => {
    const { svc, c } = build();
    c.create(req, { url: "u" } as never);
    c.rotateSecret(req, "1");
    c.delete(req, "1");
    c.getDeliveries(req, "1", "10");
    c.redeliver(req, "1", "d");
    c.test(req, "1");
    expect(svc.create).toHaveBeenCalledWith("t1", { url: "u" });
    expect(svc.rotateSecret).toHaveBeenCalledWith("t1", "1");
    expect(svc.delete).toHaveBeenCalledWith("t1", "1");
    expect(svc.getDeliveries).toHaveBeenCalledWith("t1", "1", 10);
    expect(svc.redeliver).toHaveBeenCalledWith("t1", "1", "d");
    expect(svc.sendTestEvent).toHaveBeenCalledWith("t1", "1");
  });

  it("never returns the signing secret when listing endpoints", async () => {
    const { svc, c } = build();
    svc.list.mockResolvedValue([{ id: "1", url: "https://x", secret: "whsec_a" }]);
    const result = await c.list(req);
    expect(svc.list).toHaveBeenCalledWith("t1");
    expect(result).toEqual([{ id: "1", url: "https://x" }]);
  });

  it("never returns the signing secret on read or update", async () => {
    const { svc, c } = build();
    svc.findOne.mockResolvedValue({ id: "1", secret: "whsec_a" });
    svc.update.mockResolvedValue({ id: "1", active: false, secret: "whsec_a" });
    expect(await c.findOne(req, "1")).toEqual({ id: "1" });
    expect(await c.update(req, "1", { active: false } as never)).toEqual({ id: "1", active: false });
    expect(svc.findOne).toHaveBeenCalledWith("t1", "1");
    expect(svc.update).toHaveBeenCalledWith("t1", "1", { active: false });
  });

  it("requires a webhook permission on every route", () => {
    const proto = WebhookController.prototype as unknown as Record<string, () => void>;
    const methods = Object.getOwnPropertyNames(WebhookController.prototype).filter((m) => m !== "constructor");
    expect(methods.length).toBeGreaterThan(0);
    for (const m of methods) {
      expect({ m, perm: Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object) !== undefined }).toEqual({ m, perm: true });
    }
  });
});

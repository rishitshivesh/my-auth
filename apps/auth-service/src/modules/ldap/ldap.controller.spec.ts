import { LdapController } from "./ldap.controller";

function build() {
  const svc = { create: jest.fn(), list: jest.fn(), update: jest.fn(), delete: jest.fn(), testConnection: jest.fn(), syncNow: jest.fn() };
  return { c: new LdapController(svc as never), svc };
}
const req = { tenantId: "t1", user: { sub: "u", tid: "t1" } };

describe("LdapController", () => {
  it("strips bindPasswordEncrypted from create/list/update responses", async () => {
    const { c, svc } = build();
    const row = { id: "1", name: "n", bindPasswordEncrypted: "SECRET" };
    svc.create.mockResolvedValue(row);
    svc.list.mockResolvedValue([row, { ...row, id: "2" }]);
    svc.update.mockResolvedValue(row);
    const out = [await c.create(req, {} as never), ...(await c.list(req)), await c.update(req, "1", {} as never)];
    for (const o of out) expect(o).not.toHaveProperty("bindPasswordEncrypted");
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(out[0]).toMatchObject({ id: "1", name: "n" });
  });

  it("delegates delete/test/sync with the request tenant", () => {
    const { c, svc } = build();
    c.delete(req, "1");
    c.test(req, "1");
    c.sync(req, "1");
    expect(svc.delete).toHaveBeenCalledWith("t1", "1");
    expect(svc.testConnection).toHaveBeenCalledWith("t1", "1");
    expect(svc.syncNow).toHaveBeenCalledWith("t1", "1");
  });
});

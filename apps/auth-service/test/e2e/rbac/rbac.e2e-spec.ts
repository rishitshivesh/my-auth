import { createTestApp, createTenant, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, auditItems, roleIdOf, type Member } from "../_shared/fixtures";

const ZERO = "00000000-0000-4000-8000-000000000000";
const doc = (effect: "Allow" | "Deny", actions: string[], resources: string[] = ["sentry:tenant:*:*"]) => ({
  Version: "2024-01-01",
  Statement: [{ Sid: "S1", Effect: effect, Action: actions, Resource: resources }],
});

describe("rbac", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let owner: ReturnType<typeof as>;
  let member: Member;
  let admin: Member;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    member = await addMember(t, fx, "member");
    admin = await addMember(t, fx, "admin");
  });
  afterAll(async () => {
    await t.close();
  });

  describe("permission enforcement matrix (member -> 403, anonymous -> 401)", () => {
    const routes: Array<[string, string]> = [
      ["get", "/rbac/permissions"], ["post", "/rbac/permissions"], ["get", `/rbac/permissions/${ZERO}`],
      ["put", `/rbac/permissions/${ZERO}`], ["delete", `/rbac/permissions/${ZERO}`],
      ["post", "/rbac/roles"], ["put", `/rbac/roles/${ZERO}`],
      ["delete", `/rbac/roles/${ZERO}`], ["post", `/rbac/roles/${ZERO}/permissions`], ["delete", `/rbac/roles/${ZERO}/permissions`],
      ["post", `/rbac/users/${ZERO}/roles`], ["put", `/rbac/users/${ZERO}/roles`], ["delete", `/rbac/users/${ZERO}/roles/member`],
      ["post", "/rbac/policies"], ["get", "/rbac/policies"], ["get", `/rbac/policies/${ZERO}`], ["put", `/rbac/policies/${ZERO}`],
      ["delete", `/rbac/policies/${ZERO}`], ["post", "/rbac/policies/simulate"],
      ["post", `/rbac/roles/${ZERO}/policies/${ZERO}`], ["delete", `/rbac/roles/${ZERO}/policies/${ZERO}`],
      ["post", "/rbac/groups"], ["get", "/rbac/groups"], ["get", `/rbac/groups/${ZERO}`], ["put", `/rbac/groups/${ZERO}`],
      ["delete", `/rbac/groups/${ZERO}`], ["post", `/rbac/groups/${ZERO}/members/${ZERO}`], ["delete", `/rbac/groups/${ZERO}/members/${ZERO}`],
      ["post", `/rbac/groups/${ZERO}/policies/${ZERO}`], ["delete", `/rbac/groups/${ZERO}/policies/${ZERO}`],
      ["post", "/rbac/initialize"], ["post", "/rbac/cleanup-expired"],
    ];
    it.each(routes)("%s %s", async (method, path) => {
      const call = (c: ReturnType<typeof as>) => (c as unknown as Record<string, (p: string) => import("supertest").Test>)[method]!(path);
      const denied = await call(as(t, fx.slug, member.accessToken)).send({});
      expect(denied.status).toBe(403);
      const anon = await call(t.http({ tenant: fx.slug })).send({});
      expect(anon.status).toBe(401);
    });

    it("users/:id read endpoints are 403 for members on other users", async () => {
      for (const p of [`/rbac/users/${admin.id}/roles`, `/rbac/users/${admin.id}/permissions`]) {
        expect((await as(t, fx.slug, member.accessToken).get(p)).status).toBe(403);
      }
      for (const p of [`/rbac/users/${admin.id}/check-permission`, `/rbac/users/${admin.id}/check-role`]) {
        expect((await as(t, fx.slug, member.accessToken).post(p).send({})).status).toBe(403);
      }
    });
  });

  describe("self-service endpoints", () => {
    it("me/roles, me/permissions, me/check-permission", async () => {
      const c = as(t, fx.slug, member.accessToken);
      const roles = await c.get("/rbac/me/roles");
      expect(roles.status).toBe(200);
      expect(JSON.stringify(roles.body)).toContain("member");
      expect((await c.get("/rbac/me/permissions")).status).toBe(200);
      const chk = await c.post("/rbac/me/check-permission").send({ permission: "users:delete" });
      expect(chk.status).toBe(200);
      expect(chk.body.data.hasPermission).toBe(false);
      expect((await c.post("/rbac/me/check-permission").send({})).status).toBe(422);
    });
  });

  describe("permissions CRUD", () => {
    it("create, get, list, update, delete; duplicates conflict", async () => {
      const name = `docs${Date.now()}:read`;
      const [resource, action] = name.split(":");
      const created = await owner.post("/rbac/permissions").send({ name, resource, action, description: "d" });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await owner.post("/rbac/permissions").send({ name, resource, action })).status).toBe(409);
      expect((await owner.get(`/rbac/permissions/${id}`)).status).toBe(200);
      expect(JSON.stringify((await owner.get("/rbac/permissions")).body)).toContain(name);
      expect((await owner.put(`/rbac/permissions/${id}`).send({ description: "changed" })).status).toBe(200);
      expect((await owner.delete(`/rbac/permissions/${id}`)).status).toBe(204);
      expect((await owner.get(`/rbac/permissions/${id}`)).status).toBe(404);
    });
  });

  describe("roles", () => {
    it("CRUD + permission assignment + validation", async () => {
      const name = `custom-${Date.now()}`;
      const created = await owner.post("/rbac/roles").send({ name, displayName: "Custom" });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await owner.post("/rbac/roles").send({ name })).status).toBe(409);
      expect((await owner.post("/rbac/roles").send({})).status).toBe(422);
      expect((await owner.get(`/rbac/roles/${id}`)).status).toBe(200);
      expect((await owner.put(`/rbac/roles/${id}`).send({ description: "x" })).status).toBe(200);
      expect((await owner.get("/rbac/roles?loadPermissions=true")).status).toBe(200);

      const perm = await owner.post("/rbac/permissions").send({ name: `p${Date.now()}:go`, resource: `p${Date.now()}`, action: "go" });
      const pname = perm.body.data.name as string;
      expect((await owner.post(`/rbac/roles/${id}/permissions`).send({ permissionNames: [pname] })).status).toBe(201);
      const listed = await owner.get(`/rbac/roles/${id}/permissions`);
      expect(JSON.stringify(listed.body)).toContain(pname);
      expect((await owner.delete(`/rbac/roles/${id}/permissions`).send({ permissionNames: [pname] })).status).toBe(200);
      expect((await owner.get(`/rbac/roles/${id}/policies`)).status).toBe(200);
      expect((await owner.delete(`/rbac/roles/${id}`)).status).toBe(204);
      expect((await owner.get(`/rbac/roles/${id}`)).status).toBe(404);
    });

    it("system roles cannot be deleted", async () => {
      const id = await roleIdOf(t, fx, "member");
      const res = await owner.delete(`/rbac/roles/${id}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await owner.get(`/rbac/roles/${id}`)).status).toBe(200);
    });

    it("reserved platform role names are refused (would grant superadmin via groups claim)", async () => {
      for (const name of ["super_admin", "sentry-internal", "Sentry-Internal"]) {
        const res = await owner.post("/rbac/roles").send({ name });
        expect([400, 422]).toContain(res.status);
      }
    });

    it("body cannot smuggle tenantId or isSystem", async () => {
      const other = await createTenant(t);
      const name = `smuggle-${Date.now()}`;
      const res = await owner.post("/rbac/roles").send({ name, tenantId: other.tenantId, isSystem: true });
      expect(res.status).toBe(201);
      expect(res.body.data.tenantId).toBe(fx.tenantId);
      expect(res.body.data.isSystem).toBe(false);
      const foreign = await as(t, other.slug, other.admin.accessToken).get(`/rbac/roles/${res.body.data.id}`);
      expect(foreign.status).toBe(404);
    });

    it("an admin cannot create a role above their own tier", async () => {
      const res = await as(t, fx.slug, admin.accessToken).post("/rbac/roles").send({ name: `big-${Date.now()}`, priority: 5000 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("user role assignment and hierarchy", () => {
    it("assign, set, list, remove, permissions and checks", async () => {
      const m = await addMember(t, fx, "member");
      expect((await owner.get(`/rbac/users/${m.id}/roles`)).status).toBe(200);
      const name = `grant-${Date.now()}`;
      await owner.post("/rbac/roles").send({ name });
      expect((await owner.post(`/rbac/users/${m.id}/roles`).send({ roleNames: [name], reason: "test" })).status).toBe(201);
      const chk = await owner.post(`/rbac/users/${m.id}/check-role`).send({ role: name });
      expect(chk.status).toBe(200);
      expect(JSON.stringify(chk.body)).toContain("true");
      expect((await owner.post(`/rbac/users/${m.id}/check-permission`).send({ permission: "users:read" })).status).toBe(200);
      expect((await owner.get(`/rbac/users/${m.id}/permissions`)).status).toBe(200);
      expect((await owner.delete(`/rbac/users/${m.id}/roles/${name}`)).status).toBe(200);
      expect((await owner.put(`/rbac/users/${m.id}/roles`).send({ roleNames: ["member"] })).status).toBe(200);
      expect((await owner.post(`/rbac/users/${m.id}/roles`).send({ roleNames: ["no-such-role"] })).status).toBeGreaterThanOrEqual(400);
    });

    it("an admin cannot grant owner, nor strip the owner's role", async () => {
      const m = await addMember(t, fx, "member");
      const c = as(t, fx.slug, admin.accessToken);
      expect((await c.post(`/rbac/users/${m.id}/roles`).send({ roleNames: ["owner"] })).status).toBe(403);
      expect((await c.put(`/rbac/users/${m.id}/roles`).send({ roleNames: ["owner"] })).status).toBe(403);
      expect((await c.delete(`/rbac/users/${adminUserId(fx)}/roles/owner`)).status).toBe(403);
      expect((await c.put(`/rbac/users/${adminUserId(fx)}/roles`).send({ roleNames: ["member"] })).status).toBe(403);
    });

    it("an admin cannot elevate themselves to owner", async () => {
      const c = as(t, fx.slug, admin.accessToken);
      expect((await c.post(`/rbac/users/${admin.id}/roles`).send({ roleNames: ["owner"] })).status).toBe(403);
    });

    it("the last owner cannot be demoted or have the owner role removed", async () => {
      const solo = await createTenant(t);
      const c = as(t, solo.slug, solo.admin.accessToken);
      const id = adminUserId(solo);
      const r1 = await c.delete(`/rbac/users/${id}/roles/owner`);
      expect(r1.status).toBe(409);
      const r2 = await c.put(`/rbac/users/${id}/roles`).send({ roleNames: ["member"] });
      expect(r2.status).toBe(409);
      expect(JSON.stringify((await c.get("/rbac/me/roles")).body)).toContain("owner");
    });

    it("cross-tenant: cannot assign roles to a user of another tenant", async () => {
      const other = await createTenant(t);
      const res = await owner.post(`/rbac/users/${adminUserId(other)}/roles`).send({ roleNames: ["member"] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify((await as(t, other.slug, other.admin.accessToken).get("/rbac/me/roles")).body)).not.toContain('"member"');
    });

    it("expired role assignments are cleaned up by an admin", async () => {
      const m = await addMember(t, fx, "member");
      const name = `temp-${Date.now()}`;
      await owner.post("/rbac/roles").send({ name });
      expect((await owner.post(`/rbac/users/${m.id}/roles`).send({ roleNames: [name], expiresAt: new Date(Date.now() + 1000).toISOString() })).status).toBe(201);
      await t.db.query(`UPDATE "fk_${fx.slug.replace(/-/g, "_")}".user_roles SET expires_at = now() - interval '1 hour' WHERE user_id = $1`, [m.id]);
      const res = await owner.post("/rbac/cleanup-expired");
      expect(res.status).toBe(201);
      expect(res.body.data.message).toMatch(/Removed [1-9]/);
    });

    it("/rbac/initialize is reachable by owners and forbidden for members", async () => {
      const first = await owner.post("/rbac/initialize");
      expect(first.status).toBeLessThan(300);
      const second = await owner.post("/rbac/initialize"); // idempotent
      expect(second.status).toBeLessThan(300);
      expect((await as(t, fx.slug, member.accessToken).post("/rbac/initialize")).status).toBe(403);
    });
  });

  describe("policies, allow/deny evaluation", () => {
    it("policy CRUD, validation, simulate, attach/detach to role", async () => {
      const name = `pol-${Date.now()}`;
      const created = await owner.post("/rbac/policies").send({ name, document: doc("Allow", ["users:read"]) });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await owner.post("/rbac/policies").send({ name: "bad", document: { Version: "x", Statement: [] } })).status).toBe(422);
      expect((await owner.get("/rbac/policies")).status).toBe(200);
      expect((await owner.get(`/rbac/policies/${id}`)).status).toBe(200);
      expect((await owner.put(`/rbac/policies/${id}`).send({ description: "d" })).status).toBe(200);

      const sim = await owner.post("/rbac/policies/simulate").send({ userId: member.id, action: "audit:read", resource: `sentry:tenant:${fx.tenantId}:audit:*` });
      expect(sim.status).toBe(200);

      const roleName = `r-${Date.now()}`;
      const role = await owner.post("/rbac/roles").send({ name: roleName });
      const rid = role.body.data.id as string;
      expect((await owner.post(`/rbac/roles/${rid}/policies/${id}`)).status).toBe(201);
      expect(JSON.stringify((await owner.get(`/rbac/roles/${rid}/policies`)).body)).toContain(name);
      expect((await owner.delete(`/rbac/roles/${rid}/policies/${id}`)).status).toBe(200);
      expect((await owner.delete(`/rbac/policies/${id}`)).status).toBe(204);
      expect((await owner.get(`/rbac/policies/${id}`)).status).toBe(404);
    });

    it("an attached Allow policy grants access; an explicit Deny overrides an Allow", async () => {
      const m = await addMember(t, fx, "member");
      const c = as(t, fx.slug, m.accessToken);
      expect((await c.get("/users/stats")).status).toBe(403);

      const allow = await owner.post("/rbac/policies").send({ name: `allow-${Date.now()}`, document: doc("Allow", ["users:read"]) });
      const role = await owner.post("/rbac/roles").send({ name: `reader-${Date.now()}` });
      await owner.post(`/rbac/roles/${role.body.data.id}/policies/${allow.body.data.id}`);
      await owner.post(`/rbac/users/${m.id}/roles`).send({ roleNames: [role.body.data.name] });
      // Policy/role caches are invalidated on assignment.
      expect((await c.get("/users/stats")).status).toBe(200);

      const deny = await owner.post("/rbac/policies").send({ name: `deny-${Date.now()}`, document: doc("Deny", ["users:read"]) });
      const denyRole = await owner.post("/rbac/roles").send({ name: `deny-role-${Date.now()}` });
      await owner.post(`/rbac/roles/${denyRole.body.data.id}/policies/${deny.body.data.id}`);
      await owner.post(`/rbac/users/${m.id}/roles`).send({ roleNames: [denyRole.body.data.name] });
      expect((await c.get("/users/stats")).status).toBe(403);
    });

    it("group membership brings group policies into effect", async () => {
      const m = await addMember(t, fx, "member");
      const c = as(t, fx.slug, m.accessToken);
      const pol = await owner.post("/rbac/policies").send({ name: `gp-${Date.now()}`, document: doc("Allow", ["users:read"]) });
      const g = await owner.post("/rbac/groups").send({ name: `grp-${Date.now()}`, description: "g" });
      expect(g.status).toBe(201);
      const gid = g.body.data.id as string;
      expect((await owner.post("/rbac/groups").send({ name: g.body.data.name })).status).toBe(409);
      expect((await owner.get("/rbac/groups")).status).toBe(200);
      expect((await owner.get(`/rbac/groups/${gid}`)).status).toBe(200);
      expect((await owner.put(`/rbac/groups/${gid}`).send({ description: "g2" })).status).toBe(200);
      expect((await owner.post(`/rbac/groups/${gid}/policies/${pol.body.data.id}`)).status).toBe(201);
      expect((await owner.post(`/rbac/groups/${gid}/members/${m.id}`)).status).toBe(201);
      expect((await c.get("/users/stats")).status).toBe(200);
      expect((await owner.delete(`/rbac/groups/${gid}/members/${m.id}`)).status).toBe(200);
      expect((await c.get("/users/stats")).status).toBe(403);
      expect((await owner.delete(`/rbac/groups/${gid}/policies/${pol.body.data.id}`)).status).toBe(200);
      expect((await owner.delete(`/rbac/groups/${gid}`)).status).toBe(204);
      expect((await owner.get(`/rbac/groups/${gid}`)).status).toBe(404);
    });

    it("cannot attach another tenant's policy or group member", async () => {
      const other = await createTenant(t);
      const foreignPol = await as(t, other.slug, other.admin.accessToken).post("/rbac/policies").send({ name: `fp-${Date.now()}`, document: doc("Allow", ["*"]) });
      const role = await owner.post("/rbac/roles").send({ name: `x-${Date.now()}` });
      const res = await owner.post(`/rbac/roles/${role.body.data.id}/policies/${foreignPol.body.data.id}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await owner.get(`/rbac/policies/${foreignPol.body.data.id}`)).status).toBe(404);
      const g = await owner.post("/rbac/groups").send({ name: `gx-${Date.now()}` });
      const res2 = await owner.post(`/rbac/groups/${g.body.data.id}/members/${adminUserId(other)}`);
      expect(res2.status).toBeGreaterThanOrEqual(400);
    });
  });

  it("role/permission mutations are recorded as security events", async () => {
    const m = await addMember(t, fx, "member");
    await owner.put(`/rbac/users/${m.id}/roles`).send({ roleNames: ["admin"] });
    const items = await auditItems(t, fx);
    expect(items.map((i) => i.eventType).join(",")).toMatch(/role/i);
  });
});

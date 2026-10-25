import { SeedGuestSystemRole1951000000000 } from "../../../../../packages/database/src/migrations/1951000000000-SeedGuestSystemRole";
import { createTestApp, createTenant, schemaOf, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, type Member } from "../_shared/fixtures";

interface RoleRow { name: string; priority: number; is_system: boolean }

describe("guest system role", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let owner: ReturnType<typeof as>;
  let guest: Member;

  const rolesIn = (slug: string): Promise<RoleRow[]> =>
    t.db.query(`SELECT name, priority, is_system FROM "${schemaOf(slug)}".roles ORDER BY priority DESC`);

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    guest = await addMember(t, fx, "guest");
  });
  afterAll(() => t.close());

  it("tenant provisioning seeds Guest as the lowest-priority system role, below Member", async () => {
    const roles = await rolesIn(fx.slug);
    expect(roles.map((r) => r.name)).toEqual(["owner", "admin", "member", "guest"]);
    expect(roles.at(-1)).toMatchObject({ name: "guest", priority: 5, is_system: true });
    const policies = await t.db.query(
      `SELECT p.document FROM "${schemaOf(fx.slug)}".role_policies rp
         JOIN "${schemaOf(fx.slug)}".roles r ON r.id = rp.role_id
         JOIN "${schemaOf(fx.slug)}".policies p ON p.id = rp.policy_id WHERE r.name = 'guest'`,
    );
    expect(policies).toHaveLength(1);
    expect(JSON.stringify(policies[0].document)).toContain("users:read");
  });

  it("a guest can sign in and read their own profile but cannot reach admin APIs", async () => {
    const g = as(t, fx.slug, guest.accessToken);
    expect((await g.get("/users/me")).status).toBe(200);
    expect((await g.put("/tenants/current/password-policy").send({ minLength: 14 })).status).toBe(403);
    expect((await g.get("/rbac/policies")).status).toBe(403);
    expect((await g.post("/users/invite").send({ email: "x@e2e.example.com" })).status).toBe(403);
  });

  it("a guest cannot grant themselves higher roles", async () => {
    const g = as(t, fx.slug, guest.accessToken);
    for (const roleNames of [["member"], ["admin"], ["owner"]]) {
      expect((await g.post(`/rbac/users/${guest.id}/roles`).send({ roleNames })).status).toBe(403);
    }
  });

  it("the owner can move a user between Member and Guest; the last owner is still protected", async () => {
    expect((await owner.put(`/rbac/users/${guest.id}/roles`).send({ roleNames: ["member"] })).status).toBe(200);
    expect((await owner.put(`/rbac/users/${guest.id}/roles`).send({ roleNames: ["guest"] })).status).toBe(200);
    const solo = await createTenant(t);
    const c = as(t, solo.slug, solo.admin.accessToken);
    expect((await c.put(`/rbac/users/${adminUserId(solo)}/roles`).send({ roleNames: ["guest"] })).status).toBe(409);
    expect((await c.delete(`/rbac/users/${adminUserId(solo)}/roles/owner`)).status).toBe(409);
  });

  describe("migration backfill", () => {
    const runUp = async (): Promise<void> => {
      const qr = t.db.createQueryRunner();
      try {
        await new SeedGuestSystemRole1951000000000().up(qr);
      } finally {
        await qr.release();
      }
    };

    it("restores a missing Guest role and policy in an existing tenant, idempotently", async () => {
      const old = await createTenant(t);
      const schema = `"${schemaOf(old.slug)}"`;
      await t.db.query(`DELETE FROM ${schema}.role_policies WHERE role_id IN (SELECT id FROM ${schema}.roles WHERE name = 'guest')`);
      await t.db.query(`DELETE FROM ${schema}.policies WHERE name = 'Guest Policy'`);
      await t.db.query(`DELETE FROM ${schema}.roles WHERE name = 'guest'`);
      expect((await rolesIn(old.slug)).map((r) => r.name)).not.toContain("guest");

      await runUp();
      await runUp();

      const roles = (await rolesIn(old.slug)).filter((r) => r.name === "guest");
      expect(roles).toEqual([{ name: "guest", priority: 5, is_system: true }]);
      const attached = await t.db.query(
        `SELECT count(*)::int AS n FROM ${schema}.role_policies rp JOIN ${schema}.roles r ON r.id = rp.role_id WHERE r.name = 'guest'`,
      );
      expect(attached[0].n).toBe(1);
      const policies = await t.db.query(`SELECT count(*)::int AS n FROM ${schema}.policies WHERE name = 'Guest Policy'`);
      expect(policies[0].n).toBe(1);
      expect((await rolesIn(old.slug)).map((r) => r.name)).toEqual(["owner", "admin", "member", "guest"]);
    });
  });
});

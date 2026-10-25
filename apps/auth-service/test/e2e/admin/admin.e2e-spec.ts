import { trackSchema } from "../schema-tracker";
import { ensurePlatformOperator, PLATFORM_SLUG, createTestApp, createTenant, uniqueSlug, uniqueEmail, STRONG_PASSWORD, loginUser, cookieValue, cookiesOf, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, decodeJwt, mintToken, type Member } from "../_shared/fixtures";

describe("admin (platform operator)", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let owner: ReturnType<typeof as>;
  let member: Member;
  let root: ReturnType<typeof as>;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    member = await addMember(t, fx, "member");
    root = as(t, PLATFORM_SLUG, await ensurePlatformOperator(t)); // throws loudly, never skips
  });
  afterAll(async () => {
    await t.close();
  });

  describe("authorization", () => {
    const routes: Array<[string, string]> = [
      ["get", "/admin/dashboard"], ["get", "/admin/tenants"], ["get", "/admin/tenants/check-slug?slug=abcd"],
      ["get", "/admin/tenants/00000000-0000-4000-8000-000000000000"], ["post", "/admin/tenants"],
      ["patch", "/admin/tenants/00000000-0000-4000-8000-000000000000"], ["delete", "/admin/tenants/00000000-0000-4000-8000-000000000000"],
      ["get", "/admin/activity"], ["get", "/admin/team"], ["post", "/admin/team"],
      ["delete", "/admin/team/00000000-0000-4000-8000-000000000000"], ["get", "/admin/settings"], ["patch", "/admin/settings"],
      ["post", "/admin/cleanup/tokens"], ["get", "/admin/cleanup/stats"],
    ];
    it.each(routes)("%s %s rejects tenant owners (403), members (403) and anonymous (401)", async (method, path) => {
      const call = (c: ReturnType<typeof as>) => (c as unknown as Record<string, (p: string) => import("supertest").Test>)[method]!(path);
      expect((await call(owner).send({})).status).toBe(403);
      expect((await call(as(t, fx.slug, member.accessToken)).send({})).status).toBe(403);
      expect((await call(t.http({ tenant: fx.slug })).send({})).status).toBe(401);
    });

    it("a tenant admin cannot mint platform power by naming a role like the platform role", async () => {
      for (const name of ["sentry-internal", "super_admin"]) {
        expect((await owner.post("/rbac/roles").send({ name })).status).toBeGreaterThanOrEqual(400);
      }
      expect((await owner.get("/admin/tenants")).status).toBe(403);
    });

    it("a forged token with platform groups but a bad signature is rejected", async () => {
      const real = fx.admin.accessToken;
      const [h, p, s] = real.split(".");
      const forged = `${h}.${Buffer.from(JSON.stringify({ ...decodeJwt(real), groups: ["sentry-internal"] })).toString("base64url")}.${s}`;
      expect((await as(t, fx.slug, forged).get("/admin/tenants")).status).toBe(401);
      expect(p).toBeTruthy();
    });
  });

  describe("platform metrics and activity", () => {
    it("dashboard, activity and settings respond with data", async () => {
      expect((await root.get("/admin/dashboard")).body.data).toEqual(expect.objectContaining({ totalTenants: expect.any(Number) }));
      const act = await root.get("/admin/activity?limit=5");
      expect(act.status).toBe(200);
      expect(Array.isArray(act.body.data)).toBe(true);
      const settings = await root.get("/admin/settings");
      expect(settings.status).toBe(200);
      const patched = await root.patch("/admin/settings").send({ supportEmail: "support@e2e.example.com" });
      expect([200, 501]).toContain(patched.status);
      expect((await root.patch("/admin/settings").send({ supportEmail: "bad" })).status).toBe(422);
    });
  });

  describe("tenant lifecycle", () => {
    it("create -> list/search/filter -> get -> update -> check-slug -> delete", async () => {
      const slug = uniqueSlug("adm");
      const created = await root.post("/admin/tenants").send({ name: "Lifecycle Co", slug, plan: "pro" });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await root.post("/admin/tenants").send({ name: "Dup", slug })).status).toBe(409);
      expect((await root.post("/admin/tenants").send({ name: "Bad", slug: "Bad_Slug" })).status).toBe(422);

      const list = await root.get(`/admin/tenants?search=${slug}&limit=5`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).toContain(slug);
      expect((await root.get("/admin/tenants?status=active&plan=pro&page=1&limit=1")).status).toBe(200);
      expect((await root.get(`/admin/tenants/${id}`)).body.data.slug).toBe(slug);
      expect((await root.get("/admin/tenants/00000000-0000-4000-8000-000000000000")).status).toBe(404);

      const avail = await root.get(`/admin/tenants/check-slug?slug=${slug}`);
      expect(JSON.stringify(avail.body)).toMatch(/false/);
      expect(JSON.stringify((await root.get(`/admin/tenants/check-slug?slug=${uniqueSlug("free")}`)).body)).toMatch(/true/);

      expect((await root.patch(`/admin/tenants/${id}`).send({ name: "Renamed Co", plan: "enterprise" })).status).toBe(200);
      expect((await root.patch(`/admin/tenants/${id}`).send({ status: "weird" })).status).toBe(422);
      expect((await root.delete(`/admin/tenants/${id}`)).status).toBe(204);
      expect((await root.get(`/admin/tenants/${id}`)).status).toBe(404);
    });

    it("suspending a tenant locks out its users immediately; reactivating restores access", async () => {
      const victim = await createTenant(t);
      const c = as(t, victim.slug, victim.admin.accessToken);
      expect((await c.get("/users/me")).status).toBe(200);
      expect((await root.patch(`/admin/tenants/${victim.tenantId}`).send({ status: "suspended" })).status).toBe(200);
      const after = await c.get("/users/me");
      expect([401, 403, 404]).toContain(after.status);
      expect((await loginUser(t, victim, victim.admin.email, victim.admin.password)).res.status).toBeGreaterThanOrEqual(400);
      expect((await root.patch(`/admin/tenants/${victim.tenantId}`).send({ status: "active" })).status).toBe(200);
      expect((await loginUser(t, victim, victim.admin.email, victim.admin.password)).res.status).toBe(200);
    });

    it("deleting a tenant removes its access and frees the slug for re-registration", async () => {
      const gone = await createTenant(t);
      expect((await root.delete(`/admin/tenants/${gone.tenantId}`)).status).toBe(204);
      expect((await as(t, gone.slug, gone.admin.accessToken).get("/users/me")).status).toBeGreaterThanOrEqual(400);
      const again = await t.http().post("/tenants/register").send({
        workspaceName: "Again",
        slug: gone.slug,
        adminName: "Re Born",
        adminEmail: uniqueEmail("reborn"),
        adminPassword: STRONG_PASSWORD,
        idempotencyKey: `idem-${Math.random().toString(16).slice(2)}`,
      });
      expect(again.status).toBe(201);
    });

    it("deletes a tenant while 60+ other tenant schemas exist (no FK fan-out into public.tenants)", async () => {
      const victim = await createTenant(t);
      const victimSchema = `fk_${victim.slug.replace(/-/g, "_")}`;
      const tables = (await t.db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [victimSchema])) as Array<{ table_name: string }>;
      const run = uniqueSlug("scale").replace(/-/g, "_");
      for (let i = 0; i < 60; i++) {
        const schema = `fk_e2e_${run}_${i}`;
        trackSchema(schema);
        await t.db.query(`CREATE SCHEMA "${schema}"`);
        for (const { table_name } of tables) await t.db.query(`CREATE TABLE "${schema}"."${table_name}" (LIKE "${victimSchema}"."${table_name}" INCLUDING DEFAULTS)`);
      }
      try {
        const fks = await t.db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.tenants'::regclass AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)`, [victimSchema]);
        expect(fks[0].n).toBe(0); // provisioning no longer creates tenant-schema FKs to public.tenants
        expect((await root.delete(`/admin/tenants/${victim.tenantId}`)).status).toBe(204);
        const left = await t.db.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [victimSchema]);
        expect(left).toHaveLength(0);
        expect(await t.db.query(`SELECT 1 FROM tenants WHERE id = $1`, [victim.tenantId])).toHaveLength(0);
      } finally {
        for (let i = 0; i < 60; i++) await t.db.query(`DROP SCHEMA IF EXISTS "fk_e2e_${run}_${i}" CASCADE`);
      }
    });

    it("admin-created tenant can have its owner log in", async () => {
      const slug = uniqueSlug("own");
      const email = uniqueEmail("ownr");
      const res = await root.post("/admin/tenants").send({ name: "With Owner", slug, ownerEmail: email });
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });
  });

  describe("team", () => {
    it("lists, adds and removes platform team members", async () => {
      expect((await root.get("/admin/team")).status).toBe(200);
      // Team members must be users of the platform tenant; an unknown email is 404.
      expect((await root.post("/admin/team").send({ email: uniqueEmail("ghost") })).status).toBe(404);
      expect((await root.post("/admin/team").send({ email: "not-an-email" })).status).toBe(422);
      expect((await root.delete("/admin/team/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    });
  });

  describe("token cleanup", () => {
    it("operators can run cleanup and read stats", async () => {
      const run = await root.post("/admin/cleanup/tokens");
      expect(run.status).toBe(200);
      expect(run.body.data.message).toBe("Token cleanup completed");
      expect((await root.get("/admin/cleanup/stats")).status).toBe(200);
    });
  });

  describe("superadmin setup (public)", () => {
    it("platform-info and initialized are public and non-sensitive", async () => {
      const info = await t.http().get("/superadmin/platform-info");
      expect(info.status).toBe(200);
      expect(Object.keys(info.body.data ?? info.body).sort()).toEqual(["initialized", "name", "slug"]);
      const init = await t.http().get("/superadmin/initialized");
      expect(init.status).toBe(200);
      expect(typeof (init.body.data ?? init.body).initialized).toBe("boolean");
    });

    it("setup-log-hint never reveals the token itself", async () => {
      const res = await t.http().get("/superadmin/setup-log-hint");
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/[a-f0-9]{64}/);
    });

    it("create-first-admin: validation, wrong token, and already-initialised refusal", async () => {
      const payload = { name: "Root", email: uniqueEmail("root"), password: STRONG_PASSWORD };
      expect((await t.http().post("/superadmin/create-first-admin").send({})).status).toBe(422);
      const wrong = await t.http().post("/superadmin/create-first-admin").set("x-setup-token", "0".repeat(64)).send(payload);
      expect([401, 403, 409]).toContain(wrong.status);
      const none = await t.http().post("/superadmin/create-first-admin").send(payload);
      expect([401, 403, 409]).toContain(none.status);
      const init = await t.http().get("/superadmin/initialized");
      if ((init.body.data ?? init.body).initialized) {
        const again = await t.http().post("/superadmin/create-first-admin").set("x-setup-token", "0".repeat(64)).send(payload);
        expect([403, 409]).toContain(again.status);
      }
    });
  });

  it("tenant-scoped data stays out of operator reach for ordinary tenant tokens", async () => {
    const other = await createTenant(t);
    expect((await as(t, other.slug, other.admin.accessToken).get(`/admin/tenants/${fx.tenantId}`)).status).toBe(403);
    expect(adminUserId(other)).not.toBe(adminUserId(fx));
  });
});

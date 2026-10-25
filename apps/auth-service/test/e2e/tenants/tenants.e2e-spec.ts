import { cookieValue, cookiesOf, createTestApp, createTenant, uniqueSlug, uniqueEmail, STRONG_PASSWORD, loginUser, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, auditItems, decodeJwt, type Member } from "../_shared/fixtures";

describe("tenants", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let owner: ReturnType<typeof as>;
  let member: Member;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    member = await addMember(t, fx, "member");
  });
  afterAll(async () => {
    await t.close();
  });

  describe("registration", () => {
    const body = (over: Record<string, unknown> = {}) => ({
      workspaceName: "Acme",
      slug: uniqueSlug("reg"),
      adminName: "Ada Admin",
      adminEmail: uniqueEmail("ada"),
      adminPassword: STRONG_PASSWORD,
      idempotencyKey: `idem-${Math.random().toString(16).slice(2)}`,
      ...over,
    });

    it("creates a workspace, owner role, tokens, and the owner can log in", async () => {
      const b = body();
      const res = await t.http().post("/tenants/register").send(b);
      expect(res.status).toBe(201);
      expect(res.body.data.tenantSlug ?? res.body.tenantSlug).toBe(b.slug);
      // ADR-0003: session as httpOnly cookies, no tokens in the body.
      const cookies = cookiesOf(res);
      expect(cookieValue(cookies, "accessToken")).not.toBe("");
      expect(cookieValue(cookies, "refreshToken")).not.toBe("");
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|eyJ/);
      expect((await t.http({ tenant: b.slug, cookies }).get("/auth/me")).status).toBe(200);
      const login = await loginUser(t, { slug: b.slug }, b.adminEmail, b.adminPassword);
      expect(login.res.status).toBe(200);
      const me = await as(t, b.slug, login.accessToken).get("/rbac/me/roles");
      expect(JSON.stringify(me.body)).toContain("owner");
    });

    it("is idempotent for a repeated idempotencyKey", async () => {
      const b = body();
      const a = await t.http().post("/tenants/register").send(b);
      const again = await t.http().post("/tenants/register").send(b);
      expect(a.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.body.data.tenantSlug).toBe(b.slug);
      expect(JSON.stringify(again.body)).not.toMatch(/accessToken|refreshToken|eyJ/);
    });

    it("rejects duplicate, reserved and malformed slugs", async () => {
      expect((await t.http().post("/tenants/register").send(body({ slug: fx.slug }))).status).toBe(409);
      expect((await t.http().post("/tenants/register").send(body({ slug: "admin" }))).status).toBe(409);
      for (const slug of ["ab", "UPPER-case", "bad_slug", "-lead", "trail-", "a".repeat(64)]) {
        const res = await t.http().post("/tenants/register").send(body({ slug }));
        expect([409, 422]).toContain(res.status);
      }
    });

    it("rejects weak passwords, bad emails and missing fields", async () => {
      expect((await t.http().post("/tenants/register").send(body({ adminPassword: "password" }))).status).toBeGreaterThanOrEqual(400);
      expect((await t.http().post("/tenants/register").send(body({ adminEmail: "nope" }))).status).toBe(422);
      expect((await t.http().post("/tenants/register").send({})).status).toBe(422);
    });

    it("does not leave a half-created tenant after a rejected registration", async () => {
      const b = body({ adminPassword: "password" });
      await t.http().post("/tenants/register").send(b);
      const rows = await t.db.query(`SELECT 1 FROM public.tenants WHERE slug = $1`, [b.slug]);
      expect(rows).toHaveLength(0);
    });

    it("slug-check reports availability", async () => {
      const free = await t.http().get(`/tenants/slug-check?slug=${uniqueSlug("free")}`);
      expect(free.body.data?.available ?? free.body.available).toBe(true);
      const taken = await t.http().get(`/tenants/slug-check?slug=${fx.slug}`);
      expect(taken.body.data?.available ?? taken.body.available).toBe(false);
      const none = await t.http().get("/tenants/slug-check");
      expect(none.body.data?.available ?? none.body.available).toBe(false);
    });
  });

  describe("current tenant", () => {
    it("GET /tenants/current returns the caller's tenant only", async () => {
      const res = await owner.get("/tenants/current");
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe(fx.slug);
      expect(JSON.stringify(res.body)).not.toMatch(/privateKey|private_key/);
    });

    it("unknown tenant slug is 404 and no token is 401", async () => {
      expect((await t.http({ tenant: "does-not-exist-zz" }).get("/tenants/current")).status).toBe(404);
      expect((await t.http({ tenant: fx.slug }).get("/tenants/current")).status).toBe(401);
    });
  });

  describe("platform-only tenant mutations", () => {
    it("tenant owners cannot create tenants or touch custom domains (403)", async () => {
      expect((await owner.post("/tenants").send({ slug: uniqueSlug("x"), name: "X" })).status).toBe(403);
      expect((await owner.patch(`/tenants/${fx.tenantId}/custom-domain`).send({ domain: "auth.example.com" })).status).toBe(403);
      expect((await owner.post(`/tenants/${fx.tenantId}/verify-domain`)).status).toBe(403);
      const other = await createTenant(t);
      expect((await owner.patch(`/tenants/${other.tenantId}/custom-domain`).send({ domain: "evil.example.com" })).status).toBe(403);
      const rows = await t.db.query(`SELECT custom_domain FROM public.tenants WHERE id = $1`, [other.tenantId]);
      expect(rows[0].custom_domain).toBeNull();
    });
  });

  describe("branding", () => {
    it("GET returns defaults; PUT updates, validates, and writes an audit event", async () => {
      expect((await owner.get("/tenants/current/branding")).status).toBe(200);
      const ok = await owner.put("/tenants/current/branding").send({ primaryColor: "#112233", headerWeight: "bold", backgroundStyle: "solid" });
      expect(ok.status).toBe(200);
      expect((await owner.get("/tenants/current/branding")).body.data.primaryColor).toBe("#112233");
      expect((await owner.put("/tenants/current/branding").send({ primaryColor: "red" })).status).toBe(422);
      expect((await owner.put("/tenants/current/branding").send({ fontFamily: "Comic Papyrus" })).status).toBe(422);
      expect((await owner.put("/tenants/current/branding").send({ logoUrl: "javascript:alert(1)" })).status).toBe(422);
      expect((await auditItems(t, fx)).map((i) => i.eventType)).toContain("branding.updated");
    });

    it("public branding by slug needs no auth and leaks nothing else", async () => {
      const res = await t.http({ tenant: fx.slug }).get(`/tenants/${fx.slug}/branding/public`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/email|password|secret/i);
    });

    it("members cannot change branding or upload a logo (403)", async () => {
      const c = as(t, fx.slug, member.accessToken);
      expect((await c.put("/tenants/current/branding").send({ primaryColor: "#000000" })).status).toBe(403);
      expect((await c.post("/tenants/current/branding/logo").attach("logo", Buffer.from("x"), { filename: "a.png", contentType: "image/png" })).status).toBe(403);
    });

    it("logo upload: rejects missing file, bad mime and oversize; accepts a PNG", async () => {
      expect((await owner.post("/tenants/current/branding/logo")).status).toBe(400);
      expect((await owner.post("/tenants/current/branding/logo").attach("logo", Buffer.from("<html>"), { filename: "a.html", contentType: "text/html" })).status).toBeGreaterThanOrEqual(400);
      const big = Buffer.alloc(600 * 1024, 1);
      expect([400, 413]).toContain((await owner.post("/tenants/current/branding/logo").attach("logo", big, { filename: "b.png", contentType: "image/png" })).status);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
      const ok = await owner.post("/tenants/current/branding/logo").attach("logo", png, { filename: "c.png", contentType: "image/png" });
      expect(ok.status).toBe(201);
      expect(ok.body.data.logoUrl).toMatch(/^(https?:\/\/|\/)/);
    });
  });

  describe("dashboard", () => {
    it("overview, metrics, activity, trend, breakdown respond for members", async () => {
      const c = as(t, fx.slug, member.accessToken);
      for (const p of ["/dashboard", "/dashboard/tenant-settings", "/dashboard/tenant-metrics", "/dashboard/tenant-activity", "/dashboard/api-call-trend", "/dashboard/auth-breakdown"]) {
        const res = await c.get(p);
        expect([200, 403]).toContain(res.status);
      }
      expect((await owner.get("/dashboard/tenant-metrics")).status).toBe(200);
    });

    it("tenant-settings PATCH requires tenant:write and validates the body", async () => {
      expect((await owner.patch("/dashboard/tenant-settings").send({ featureFlags: { mfa_grace_3d: true } })).status).toBe(200);
      expect((await owner.patch("/dashboard/tenant-settings").send({})).status).toBe(422);
      expect((await as(t, fx.slug, member.accessToken).patch("/dashboard/tenant-settings").send({ featureFlags: {} })).status).toBe(403);
      expect((await auditItems(t, fx)).map((i) => i.eventType)).toContain("tenant.settings_updated");
    });

    it("stores the social client secret encrypted and only reports hasClientSecret", async () => {
      const secret = "plaintext-client-secret-" + Math.random().toString(16).slice(2);
      const res = await owner.patch("/dashboard/tenant-settings/social/github").send({ enabled: true, clientId: "cid-1", clientSecret: secret });
      expect(res.status).toBe(200);
      const rows = await t.db.query(`SELECT client_secret FROM "fk_${fx.slug.replace(/-/g, "_")}".tenant_social_providers WHERE provider = 'github'`);
      expect(rows[0].client_secret).toMatch(/^enc:v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(rows[0].client_secret).not.toContain(secret);

      const get = await owner.get("/dashboard/tenant-settings");
      const gh = get.body.data.socialProviders.find((p: { provider: string }) => p.provider === "github");
      expect(gh).toMatchObject({ clientId: "cid-1", hasClientSecret: true });
      expect(JSON.stringify(get.body)).not.toContain(secret);
      expect(JSON.stringify(get.body)).not.toContain("enc:v1");
    });

    it("social provider toggle validates the provider and body", async () => {
      expect((await owner.patch("/dashboard/tenant-settings/social/google").send({ enabled: "yes" })).status).toBe(422);
      expect((await owner.patch("/dashboard/tenant-settings/social/not-a-provider").send({ enabled: true })).status).toBeGreaterThanOrEqual(400);
      expect((await owner.patch("/dashboard/tenant-settings/social/google").send({ enabled: false })).status).toBeLessThan(500);
      expect((await as(t, fx.slug, member.accessToken).patch("/dashboard/tenant-settings/social/google").send({ enabled: true })).status).toBe(403);
    });
  });

  describe("sessions", () => {
    it("active, analytics, delete one, delete others, delete all", async () => {
      const m = await addMember(t, fx, "member");
      const second = await loginUser(t, fx, m.email, m.password);
      const c = as(t, fx.slug, m.accessToken);
      const active = await c.get("/sessions/active");
      expect(active.status).toBe(200);
      expect(active.body.data.length).toBeGreaterThanOrEqual(2);
      expect((await c.get("/sessions/analytics")).status).toBe(200);
      const sid = decodeJwt(second.accessToken)["sessionId"] as string;
      expect((await c.delete(`/sessions/${sid}`)).status).toBe(204);
      expect((await as(t, fx.slug, second.accessToken).get("/users/me")).status).toBe(401);
      const third = await loginUser(t, fx, m.email, m.password);
      expect((await c.delete("/sessions/all/other")).status).toBe(200);
      expect((await as(t, fx.slug, third.accessToken).get("/users/me")).status).toBe(401);
      expect((await c.get("/users/me")).status).toBe(200);
      expect((await c.delete("/sessions/all")).status).toBe(200);
      expect((await c.get("/users/me")).status).toBe(401);
    });

    it("cannot revoke someone else's session", async () => {
      const a = await addMember(t, fx, "member");
      const b = await addMember(t, fx, "member");
      const sidB = decodeJwt(b.accessToken)["sessionId"] as string;
      const res = await as(t, fx.slug, a.accessToken).delete(`/sessions/${sidB}`);
      expect([403, 404]).toContain(res.status);
      expect((await as(t, fx.slug, b.accessToken).get("/users/me")).status).toBe(200);
    });
  });

  it("sanity: fixture owner id is stable", () => {
    expect(adminUserId(fx)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

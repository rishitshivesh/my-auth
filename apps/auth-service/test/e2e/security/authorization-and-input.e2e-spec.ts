import { createTenant, createTestApp, type TenantFixture, type TestApp } from "../support";

describe("security: authorization, SSRF, input handling, headers", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
  });
  afterAll(() => t.close());

  const asA = () => t.http({ tenant: a.slug, bearer: a.admin.accessToken });

  describe("tenant management routes (IDOR / privilege escalation regression)", () => {
    it("a tenant admin cannot create tenants", async () => {
      const res = await asA().post("/tenants").send({ slug: "evil-tenant-1", name: "Evil" });
      expect(res.status).toBe(403);
    });

    it("a tenant admin cannot set another tenant's custom domain", async () => {
      const res = await asA().patch(`/tenants/${b.tenantId}/custom-domain`).send({ domain: "auth.attacker.example.com" });
      expect(res.status).toBe(403);
      const rows = await t.db.query(`SELECT custom_domain FROM public.tenants WHERE id = $1`, [b.tenantId]);
      expect(rows[0].custom_domain).toBeNull();
    });

    it("a tenant admin cannot mark a domain verified (no DNS proof exists)", async () => {
      const res = await asA().post(`/tenants/${a.tenantId}/verify-domain`);
      expect(res.status).toBe(403);
    });

    it("custom-domain changes are platform-administrator only until DNS proof exists", async () => {
      const res = await asA().patch(`/tenants/${a.tenantId}/custom-domain`).send({ domain: "auth.acme-e2e.example.com" });
      expect(res.status).toBe(403);
    });

    it("rejects malformed custom domains before any authorization side effect", async () => {
      const res = await asA().patch(`/tenants/${a.tenantId}/custom-domain`).send({ domain: "a b;drop table" });
      expect([403, 422]).toContain(res.status);
    });
  });

  describe("SSRF (webhooks)", () => {
    it.each([
      "http://127.0.0.1/hook",
      "http://169.254.169.254/latest/meta-data",
      "http://100.100.100.200/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://2130706433/",
      "ftp://example.com/",
      "file:///etc/passwd",
    ])("refuses %s", async (url) => {
      const res = await asA().post("/webhooks").send({ url, events: ["user.created"] });
      expect(res.status).toBe(422);
    });
  });

  describe("LDAP connections", () => {
    it("never returns the encrypted bind password and refuses loopback hosts", async () => {
      const bad = await asA().post("/ldap/connections").send({
        name: "x", host: "127.0.0.1", bindDn: "cn=a", bindPassword: "pw", baseDn: "dc=x",
      });
      expect(bad.status).toBe(422);

      const ok = await asA().post("/ldap/connections").send({
        name: "x", host: "10.20.30.40", bindDn: "cn=a", bindPassword: "super-secret-pw", baseDn: "dc=x",
      });
      expect(ok.status).toBe(201);
      expect(JSON.stringify(ok.body)).not.toMatch(/bindPasswordEncrypted|super-secret-pw/);
      const list = await asA().get("/ldap/connections");
      expect(JSON.stringify(list.body)).not.toMatch(/bindPasswordEncrypted|super-secret-pw/);
    });
  });

  describe("mass assignment and injection", () => {
    it("PUT /users/me cannot change privileged columns", async () => {
      const before = await t.db.query(`SELECT id, tenant_id FROM "fk_${a.slug.replace(/-/g, "_")}".users WHERE email = $1`, [a.admin.email]);
      const res = await asA().put("/users/me").send({
        firstName: "Renamed", isActive: false, tenantId: b.tenantId, emailVerified: false, passwordHash: "x", roles: ["super_admin"],
      });
      expect(res.status).toBeLessThan(500);
      const after = await t.db.query(
        `SELECT tenant_id, is_active FROM "fk_${a.slug.replace(/-/g, "_")}".users WHERE email = $1`,
        [a.admin.email],
      );
      expect(after[0].tenant_id).toBe(before[0].tenant_id);
      expect(after[0].is_active).toBe(true);
    });

    it("sortBy is allow-listed (no ORDER BY injection)", async () => {
      const res = await asA().get("/users").query({ sortBy: "createdAt; DROP TABLE users;--" });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/syntax error|QueryFailed|pg_/i);
    });

    it("SQL metacharacters in login do not break out or leak SQL errors", async () => {
      const res = await t.http({ tenant: a.slug }).post("/auth/login").send({ email: "' OR 1=1 --@x.com", password: "whatever-Pass1!" });
      expect([400, 401, 422]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(/syntax error|QueryFailed|SELECT /i);
    });

    it("a tenant slug header with quotes does not resolve or error with SQL", async () => {
      const res = await t.http({ tenant: `x"; DROP SCHEMA public;--` }).get("/auth/me");
      expect([400, 401, 404, 422]).toContain(res.status);
    });
  });

  describe("error hygiene and headers", () => {
    it("malformed ids return client errors without stack traces", async () => {
      const res = await asA().get("/users/not-a-uuid");
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toMatch(/\bat .*\(.*:\d+:\d+\)|QueryFailedError|node_modules/);
    });

    it("sets hardening headers and hides the framework", async () => {
      const res = await t.http().get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["strict-transport-security"]).toBeDefined();
      expect(res.headers["x-frame-options"] ?? res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["referrer-policy"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("does not reflect an unknown Origin and never answers '*' with credentials", async () => {
      const res = await t.http({ headers: { origin: "https://evil.example.org" } }).get("/health");
      expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example.org");
      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    });

    it("does not allow an unknown Origin on preflight", async () => {
      const res = await t
        .http({ headers: { origin: "https://evil.example.org", "access-control-request-method": "POST" } })
        .post("/auth/login");
      expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example.org");
    });
  });

  describe("JWKS", () => {
    it("exposes public key material only", async () => {
      const res = await t.http().get("/.well-known/jwks.json");
      expect(res.status).toBe(200);
      for (const k of res.body.keys as Array<Record<string, unknown>>) {
        for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) expect(k[priv]).toBeUndefined();
        expect(k["alg"]).toBe("RS256");
      }
    });
  });

  describe("credential storage", () => {
    it("passwords are Argon2id with >= 19 MiB memory and t >= 2", async () => {
      const rows = await t.db.query(
        `SELECT password_hash FROM "fk_${a.slug.replace(/-/g, "_")}".users WHERE email = $1`,
        [a.admin.email],
      );
      const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=\d+\$/.exec(rows[0].password_hash as string);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(19456);
      expect(Number(m![2])).toBeGreaterThanOrEqual(2);
    });
  });

  describe("rate limiting", () => {
    it("throttles repeated login attempts from one IP", async () => {
      const ip = "10.250.1.1";
      const statuses: number[] = [];
      for (let i = 0; i < 14; i++) {
        const r = await t.http({ tenant: a.slug, ip }).post("/auth/login").send({ email: "nobody@e2e.example.com", password: "Wrong-Pass-1234!" });
        statuses.push(r.status);
      }
      expect(statuses).toContain(429);
    });
  });
});

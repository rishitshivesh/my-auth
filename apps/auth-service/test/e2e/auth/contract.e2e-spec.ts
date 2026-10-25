import { createTenant, createTestApp, registerAndVerifyUser, type TenantFixture, type TestApp } from "../support";

const PROBLEM = /^application\/problem\+json/;

describe("HTTP contract: problem+json, request ids, envelope", () => {
  let t: TestApp;
  let tenant: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());

  function expectProblem(res: { status: number; headers: Record<string, string>; body: Record<string, unknown> }, status: number, code: string): void {
    expect(res.status).toBe(status);
    expect(res.headers["content-type"]).toMatch(PROBLEM);
    expect(res.body).toMatchObject({
      type: `urn:scrolloop:problem:${code}`,
      status,
      code,
      title: expect.any(String),
      requestId: res.headers["x-request-id"],
    });
  }

  it("401 AUTH_TOKEN_INVALID", async () => {
    expectProblem(await t.http({ tenant: tenant.slug }).get("/auth/me"), 401, "AUTH_TOKEN_INVALID");
  });

  it("401 for a forged bearer token", async () => {
    const res = await t.http({ tenant: tenant.slug, bearer: "a.b.c" }).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(PROBLEM);
  });

  it("403 ACCESS_FORBIDDEN for a member calling an admin endpoint", async () => {
    const member = await registerAndVerifyUser(t, tenant);
    const login = await t.http({ tenant: tenant.slug }).post("/auth/login").send(member);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    const res = await t.http({ tenant: tenant.slug, cookies }).get("/users/stats");
    expect(res.status).toBe(403);
    expect(res.headers["content-type"]).toMatch(PROBLEM);
    expect(res.body.code).toBe("ACCESS_FORBIDDEN");
  });

  it("404 RESOURCE_NOT_FOUND for an unknown route", async () => {
    expectProblem(await t.http({ tenant: tenant.slug }).get("/nope/nothing"), 404, "RESOURCE_NOT_FOUND");
  });

  it("404 TENANT_NOT_FOUND for an unknown tenant", async () => {
    expectProblem(await t.http({ tenant: "does-not-exist-xyz" }).get("/auth/me"), 404, "TENANT_NOT_FOUND");
  });

  it("409 RESOURCE_CONFLICT when claiming a taken workspace slug", async () => {
    const res = await t.http().post("/tenants/register").send({
      workspaceName: "Dup",
      slug: tenant.slug,
      adminName: "Dup Admin",
      adminEmail: "dup-admin@e2e.example.com",
      adminPassword: "Tr0ub4dor&3-Xylophone!",
      idempotencyKey: "dup-key-1",
    });
    expectProblem(res, 409, "RESOURCE_CONFLICT");
  });

  it("422 VALIDATION_FAILED carries per-field errors", async () => {
    const res = await t.http({ tenant: tenant.slug }).post("/auth/login").send({ email: "bad", password: "" });
    expectProblem(res, 422, "VALIDATION_FAILED");
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "email", message: expect.any(String) })]));
  });

  it("400 for malformed JSON", async () => {
    const res = await t
      .http({ tenant: tenant.slug })
      .post("/auth/login")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(PROBLEM);
  });

  it("429 RATE_LIMITED sets Retry-After matching retryAfterSeconds", async () => {
    const ip = "203.0.113.50";
    let res = await t.http({ tenant: tenant.slug, ip }).post("/auth/forgot-password").send({ email: "x@e2e.example.com" });
    for (let i = 0; i < 4 && res.status !== 429; i++) {
      res = await t.http({ tenant: tenant.slug, ip }).post("/auth/forgot-password").send({ email: "x@e2e.example.com" });
    }
    expectProblem(res, 429, "RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.body.retryAfterSeconds).toBe(Number(res.headers["retry-after"]));
  });

  it("problem bodies never leak stack traces or internals", async () => {
    const res = await t.http({ tenant: tenant.slug }).post("/auth/login").send({ email: "a@b.co", password: "x" });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.ts|QueryFailed|typeorm/i);
  });

  describe("x-request-id", () => {
    it("generates one when absent", async () => {
      const res = await t.http().get("/health");
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("echoes a safe caller-supplied id", async () => {
      const res = await t.http({ headers: { "x-request-id": "client-req-12345" } }).get("/health");
      expect(res.headers["x-request-id"]).toBe("client-req-12345");
    });

    it("echoes it into problem bodies", async () => {
      const res = await t.http({ tenant: tenant.slug, headers: { "x-request-id": "client-req-98765" } }).get("/auth/me");
      expect(res.body.requestId).toBe("client-req-98765");
    });

    it.each([["short"], ["has spaces in it!!"], ["x".repeat(65)], ["bad/chars;drop"]])("replaces unsafe id %j", async (bad) => {
      const res = await t.http({ headers: { "x-request-id": bad } }).get("/health");
      expect(res.headers["x-request-id"]).not.toBe(bad);
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("response envelope", () => {
    it("wraps successes as { status, data } with the real HTTP status", async () => {
      const member = await registerAndVerifyUser(t, tenant);
      const login = await t.http({ tenant: tenant.slug }).post("/auth/login").send(member);
      expect(login.body).toEqual({ status: 200, data: expect.any(Object) });

      const created = await t.http({ tenant: tenant.slug }).post("/auth/register").send({ email: "env-" + member.email, password: member.password });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe(201);
    });

    it("errors are NOT enveloped", async () => {
      const res = await t.http({ tenant: tenant.slug }).get("/auth/me");
      expect(res.body).not.toHaveProperty("data");
    });
  });

  describe("global middleware", () => {
    it("sets helmet security headers", async () => {
      const res = await t.http().get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("CORS allows the configured origin and blocks others", async () => {
      const ok = await t.http({ headers: { origin: "http://localhost:3000" } }).get("/health");
      expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(ok.headers["access-control-allow-credentials"]).toBe("true");
      const bad = await t.http({ headers: { origin: "https://evil.example" } }).get("/health");
      expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("strips unknown body properties (whitelist)", async () => {
      const email = `wl-${Date.now()}@e2e.example.com`;
      const res = await t.http({ tenant: tenant.slug }).post("/auth/register").send({ email, password: "Tr0ub4dor&3-Xylophone!", isAdmin: true });
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toContain("isAdmin");
    });
  });
});

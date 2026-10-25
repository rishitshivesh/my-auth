import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";

describe("e2e smoke", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(async () => {
    await t.close();
  });

  it("GET /health responds and echoes x-request-id", async () => {
    const res = await t.http().get("/health");
    expect(res.status).toBeLessThan(500);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("404 is problem+json with requestId matching header", async () => {
    const res = await t.http({ tenant: tenant.slug }).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("created tenant admin can call /auth/me", async () => {
    const res = await t.http({ tenant: tenant.slug, cookies: tenant.admin.cookies }).get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
  });
});

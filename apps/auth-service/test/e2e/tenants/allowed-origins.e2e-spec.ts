import { createTestApp, createTenant, type TenantFixture, type TestApp } from "../support";
import { addMember, as, auditItems, type Member } from "../_shared/fixtures";

const ORIGIN_A = "https://app.alpha-e2e.example.com";
const ORIGIN_B = "https://app.beta-e2e.example.com";

describe("per-tenant CORS allowed origins", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let ownerA: ReturnType<typeof as>;
  let ownerB: ReturnType<typeof as>;
  let member: Member;

  const acao = async (origin: string, tenant?: string, path = "/health") => {
    const res = await t.http({ tenant, headers: { origin } }).get(path);
    return res.headers["access-control-allow-origin"] as string | undefined;
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    ownerA = as(t, a.slug, a.admin.accessToken);
    ownerB = as(t, b.slug, b.admin.accessToken);
    member = await addMember(t, a, "member");
    expect((await ownerA.put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_A] })).status).toBe(200);
    expect((await ownerB.put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_B] })).status).toBe(200);
  });
  afterAll(() => t.close());

  it("GET returns the saved list; unauthenticated and member callers are refused", async () => {
    const res = await ownerA.get("/tenants/current/allowed-origins");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ origins: [ORIGIN_A] });
    expect((await t.http({ tenant: a.slug }).get("/tenants/current/allowed-origins")).status).toBe(401);
    expect((await as(t, a.slug, member.accessToken).put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_A] })).status).toBe(403);
  });

  it("PUT rejects wildcards, plain http, paths, trailing slashes and oversized lists", async () => {
    for (const bad of ["*", "https://*.example.com", "http://example.com", "https://example.com/path", "https://example.com/", "null", "ftp://example.com"]) {
      const res = await ownerA.put("/tenants/current/allowed-origins").send({ origins: [bad] });
      expect({ bad, status: res.status }).toEqual({ bad, status: 422 });
    }
    const tooMany = Array.from({ length: 51 }, (_, i) => `https://o${i}.example.com`);
    expect((await ownerA.put("/tenants/current/allowed-origins").send({ origins: tooMany })).status).toBe(422);
    expect((await ownerA.put("/tenants/current/allowed-origins").send({ origins: "https://x.example.com" })).status).toBe(422);
    // nothing was changed by the failed attempts
    expect((await ownerA.get("/tenants/current/allowed-origins")).body.data).toEqual({ origins: [ORIGIN_A] });
  });

  it("a tenant's origin is accepted for that tenant", async () => {
    expect(await acao(ORIGIN_A, a.slug)).toBe(ORIGIN_A);
    expect(await acao(ORIGIN_B, b.slug)).toBe(ORIGIN_B);
  });

  it("REGRESSION: a tenant's origin is never accepted for another tenant", async () => {
    expect(await acao(ORIGIN_A, b.slug)).toBeUndefined();
    expect(await acao(ORIGIN_B, a.slug)).toBeUndefined();
    // and not on tenant-less (platform) routes
    expect(await acao(ORIGIN_A)).toBeUndefined();
    expect(await acao(ORIGIN_B)).toBeUndefined();
  });

  it("the platform CORS_ORIGINS fallback works for any tenant and without one", async () => {
    expect(await acao("http://localhost:3000", a.slug)).toBe("http://localhost:3000");
    expect(await acao("http://localhost:3000", b.slug)).toBe("http://localhost:3000");
    expect(await acao("http://localhost:3000")).toBe("http://localhost:3000");
    expect(await acao("https://evil.example", a.slug)).toBeUndefined();
  });

  it("keeps credentials behaviour for allowed origins", async () => {
    const res = await t.http({ tenant: a.slug, headers: { origin: ORIGIN_A } }).get("/health");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("preflight: a hostless preflight lets a listed origin proceed, an unlisted one never", async () => {
    const preflight = (origin: string) =>
      t.http({ headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "x-tenant-slug" } }).options("/auth/login");
    const ok = await preflight(ORIGIN_A);
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN_A);
    const bad = await preflight("https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("edits take effect immediately and removals are enforced", async () => {
    const ORIGIN_A2 = "https://second.alpha-e2e.example.com";
    expect((await ownerA.put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_A, ORIGIN_A2] })).status).toBe(200);
    expect(await acao(ORIGIN_A2, a.slug)).toBe(ORIGIN_A2);
    expect(await acao(ORIGIN_A2, b.slug)).toBeUndefined();
    expect((await ownerA.put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_A] })).status).toBe(200);
    expect(await acao(ORIGIN_A2, a.slug)).toBeUndefined();
  });

  it("a tenant admin can only edit their own tenant's list", async () => {
    await ownerB.put("/tenants/current/allowed-origins").send({ origins: [ORIGIN_B] });
    expect((await ownerA.get("/tenants/current/allowed-origins")).body.data.origins).not.toContain(ORIGIN_B);
  });

  it("PUT is audited", async () => {
    expect((await auditItems(t, a)).map((i) => i.eventType)).toContain("tenant.settings_updated");
  });
});

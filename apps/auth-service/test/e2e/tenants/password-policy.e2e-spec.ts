import { createTestApp, createTenant, loginUser, registerAndVerifyUser, schemaOf, STRONG_PASSWORD, uniqueEmail, type TenantFixture, type TestApp } from "../support";
import { addMember, as, auditItems, type Member } from "../_shared/fixtures";

describe("tenant password policy", () => {
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
  afterAll(() => t.close());

  it("GET returns platform defaults until configured; members are refused", async () => {
    const res = await owner.get("/tenants/current/password-policy");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      minLength: 12, requireCommonPasswordCheck: true, historyCount: 5, maxAgeDays: 0, lockoutThreshold: 5, lockoutDurationMinutes: 15,
    });
    expect((await as(t, fx.slug, member.accessToken).get("/tenants/current/password-policy")).status).toBe(403);
    expect((await as(t, fx.slug, member.accessToken).put("/tenants/current/password-policy").send({ minLength: 14 })).status).toBe(403);
    expect((await t.http({ tenant: fx.slug }).get("/tenants/current/password-policy")).status).toBe(401);
  });

  it("PUT validates bounds: tenants cannot go below the platform minimum of 12", async () => {
    for (const body of [{ minLength: 11 }, { minLength: 129 }, { historyCount: -1 }, { lockoutThreshold: 1 }, { maxAgeDays: 99999 }, { minLength: "x" }]) {
      const res = await owner.put("/tenants/current/password-policy").send(body);
      expect({ body, status: res.status, text: res.text.slice(0, 200) }).toMatchObject({ status: 422 });
    }
  });

  it("PUT persists, is audited, and is read back", async () => {
    const res = await owner.put("/tenants/current/password-policy").send({ minLength: 24, historyCount: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ minLength: 24, historyCount: 3 });
    expect((await owner.get("/tenants/current/password-policy")).body.data).toMatchObject({ minLength: 24, historyCount: 3 });
    expect((await auditItems(t, fx)).map((i) => i.eventType)).toContain("tenant.settings_updated");
  });

  describe("enforcement", () => {
    let strict: TenantFixture;
    let strictOwner: ReturnType<typeof as>;
    beforeAll(async () => {
      strict = await createTenant(t);
      strictOwner = as(t, strict.slug, strict.admin.accessToken);
    });

    it("registration enforces the tenant's minimum length; other tenants are unaffected", async () => {
      expect((await strictOwner.put("/tenants/current/password-policy").send({ minLength: 30 })).status).toBe(200);
      const email = uniqueEmail("strict");
      const short = await t.http({ tenant: strict.slug }).post("/auth/register").send({ email, password: STRONG_PASSWORD, firstName: "E2E" });
      expect(short.status).toBe(422);
      const plain = await createTenant(t);
      const unaffected = await t.http({ tenant: plain.slug }).post("/auth/register").send({ email: uniqueEmail("plain"), password: STRONG_PASSWORD.slice(0, 22), firstName: "E2E" });
      expect(unaffected.status).toBeLessThan(300);
    });

    it("the common-password check can be switched off", async () => {
      const lax = await createTenant(t);
      const laxOwner = as(t, lax.slug, lax.admin.accessToken);
      const body = (e: string) => ({ email: e, password: "Password@1234", firstName: "E2E" });
      expect((await t.http({ tenant: lax.slug }).post("/auth/register").send(body(uniqueEmail("c1")))).status).toBe(422);
      expect((await laxOwner.put("/tenants/current/password-policy").send({ requireCommonPasswordCheck: false })).status).toBe(200);
      const relaxed = await t.http({ tenant: lax.slug }).post("/auth/register").send(body(uniqueEmail("c2")));
      expect({ status: relaxed.status, text: relaxed.text.slice(0, 300) }).toMatchObject({ status: 201 });
    });

    it("lockout uses the tenant's threshold", async () => {
      const lock = await createTenant(t);
      const lockOwner = as(t, lock.slug, lock.admin.accessToken);
      expect((await lockOwner.put("/tenants/current/password-policy").send({ lockoutThreshold: 3, lockoutDurationMinutes: 30 })).status).toBe(200);
      const user = await registerAndVerifyUser(t, lock);
      for (let i = 0; i < 3; i++) expect((await loginUser(t, lock, user.email, "Wrong-Password-123!")).res.status).toBe(401);
      const locked = await loginUser(t, lock, user.email, user.password);
      expect(locked.res.status).toBe(423);
      const row = await t.db.query(`SELECT locked_until FROM "${schemaOf(lock.slug)}".users WHERE email = $1`, [user.email]);
      const minutes = (new Date(row[0].locked_until).getTime() - Date.now()) / 60000;
      expect(minutes).toBeGreaterThan(28);
    });

    it("an expired password is refused at login with AUTH_PASSWORD_EXPIRED", async () => {
      const aged = await createTenant(t);
      const agedOwner = as(t, aged.slug, aged.admin.accessToken);
      const user = await registerAndVerifyUser(t, aged);
      expect((await loginUser(t, aged, user.email, user.password)).res.status).toBe(200);
      expect((await agedOwner.put("/tenants/current/password-policy").send({ maxAgeDays: 30 })).status).toBe(200);
      expect((await loginUser(t, aged, user.email, user.password)).res.status).toBe(200);
      await t.db.query(`UPDATE "${schemaOf(aged.slug)}".users SET password_changed_at = now() - interval '45 days' WHERE email = $1`, [user.email]);
      const res = await loginUser(t, aged, user.email, user.password);
      expect(res.res.status).toBe(403);
      expect(JSON.stringify(res.res.body)).toContain("AUTH_PASSWORD_EXPIRED");
    });
  });
});

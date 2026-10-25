import * as speakeasy from "speakeasy";
import {
  cookieValue, cookiesOf, createTenant, createTestApp, loginUser, registerAndVerifyUser, schemaOf,
  type TenantFixture, type TestApp,
} from "../support";

const totp = (secret: string, offset = 0): string =>
  speakeasy.totp({ secret, encoding: "base32", time: Math.floor(Date.now() / 1000) + offset * 30 });

const amrOf = (accessToken: string): string[] =>
  (JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString()) as { amr: string[] }).amr;

describe("pre-session MFA enrollment, second-factor methods and step-up", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let other: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
    other = await createTenant(t);
  });
  afterAll(() => t.close());

  const anon = (slug = tenant.slug) => t.http({ tenant: slug });

  describe("enrollment under a required-MFA policy", () => {
    let enforced: TenantFixture;
    beforeAll(async () => {
      enforced = await createTenant(t);
      const upd = await t.db.query(`UPDATE "${schemaOf(enforced.slug)}".tenant_mfa_policy SET enforce_for_all_users = true WHERE tenant_id = $1`, [enforced.tenantId]);
      if (!upd[1]) await t.db.query(`INSERT INTO "${schemaOf(enforced.slug)}".tenant_mfa_policy (tenant_id, enforce_for_all_users) VALUES ($1, true)`, [enforced.tenantId]);
    });

    const enrollmentFor = async () => {
      const u = await registerAndVerifyUser(t, enforced);
      const res = await loginUser(t, enforced, u.email, u.password);
      expect(res.res.body.data).toMatchObject({ status: "mfa_enrollment_required", enrollmentToken: expect.any(String) });
      return { u, token: res.res.body.data.enrollmentToken as string };
    };

    it("sets up and confirms TOTP with the token, then issues cookies with a truthful amr", async () => {
      const { token } = await enrollmentFor();
      const http = anon(enforced.slug);
      const setup = await http.post("/auth/mfa/enroll/totp/setup").send({ enrollmentToken: token });
      expect(setup.status).toBe(200);
      const secret = setup.body.data.secret as string;
      expect(setup.body.data.qrCode).toMatch(/^data:image/);
      expect(setup.body.data.backupCodes).toBeUndefined();

      const bad = await http.post("/auth/mfa/enroll/totp/confirm").send({ enrollmentToken: token, code: "000000" });
      expect(bad.status).toBe(401);
      expect(cookieValue(cookiesOf(bad), "accessToken")).toBe("");

      const ok = await http.post("/auth/mfa/enroll/totp/confirm").send({ enrollmentToken: token, code: totp(secret) });
      expect(ok.status).toBe(200);
      expect(ok.body.data.backupCodes).toHaveLength(10);
      const cookies = cookiesOf(ok);
      const access = cookieValue(cookies, "accessToken");
      expect(access).not.toBe("");
      expect(amrOf(access)).toEqual(expect.arrayContaining(["pwd", "totp", "mfa"]));
      expect(JSON.stringify(ok.body)).not.toContain(access);
      expect((await t.http({ tenant: enforced.slug, cookies }).get("/auth/me")).status).toBe(200);

      const replay = await http.post("/auth/mfa/enroll/totp/confirm").send({ enrollmentToken: token, code: totp(secret, 1) });
      expect([409, 401]).toContain(replay.status);
    });

    it("accepts the token from the mfa_enrollment_token cookie", async () => {
      const { token } = await enrollmentFor();
      const res = await anon(enforced.slug).post("/auth/mfa/enroll/totp/setup").set("cookie", `mfa_enrollment_token=${token}`).send({});
      expect(res.status).toBe(200);
    });

    it("refuses missing, malformed, wrong-tenant and session-type tokens", async () => {
      const { token } = await enrollmentFor();
      expect((await anon(enforced.slug).post("/auth/mfa/enroll/totp/setup").send({})).status).toBe(401);
      expect((await anon(enforced.slug).post("/auth/mfa/enroll/totp/setup").send({ enrollmentToken: "nope" })).status).toBe(401);
      expect((await anon(other.slug).post("/auth/mfa/enroll/totp/setup").send({ enrollmentToken: token })).status).toBe(401);
      expect((await anon(enforced.slug).post("/auth/mfa/enroll/totp/setup").send({ enrollmentToken: enforced.admin.accessToken })).status).toBe(401);
    });

    it("burns the token after too many wrong codes", async () => {
      const { token } = await enrollmentFor();
      const http = anon(enforced.slug);
      const setup = await http.post("/auth/mfa/enroll/totp/setup").send({ enrollmentToken: token });
      for (let i = 0; i < 6; i++) await http.post("/auth/mfa/enroll/totp/confirm").send({ enrollmentToken: token, code: "000000" });
      const secret = setup.body.data.secret as string;
      const after = await http.post("/auth/mfa/enroll/totp/confirm").send({ enrollmentToken: token, code: totp(secret) });
      expect(after.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("login-time second factor", () => {
    async function userWithTotp() {
      const u = await registerAndVerifyUser(t, tenant);
      const s = await loginUser(t, tenant, u.email, u.password);
      const http = t.http({ tenant: tenant.slug, cookies: s.cookies });
      const secret: string = (await http.post("/mfa/setup/totp")).body.data.secret;
      expect((await http.post("/mfa/verify/totp").send({ token: totp(secret) })).status).toBe(200);
      return { ...u, secret };
    }

    it("totp is the default method and records totp in amr", async () => {
      const u = await userWithTotp();
      const login = await loginUser(t, tenant, u.email, u.password);
      expect(login.res.body.data.availableMethods).toEqual(["totp"]);
      const res = await anon().post("/auth/mfa/verify").send({ tempToken: login.res.body.data.tempToken, method: "totp", code: totp(u.secret, 1) });
      expect(res.status).toBe(200);
      expect(amrOf(cookieValue(cookiesOf(res), "accessToken"))).toEqual(["pwd", "otp", "totp", "mfa"]);
    });

    it("methods that are not enrolled cannot be used or requested", async () => {
      const u = await userWithTotp();
      const temp = (await loginUser(t, tenant, u.email, u.password)).res.body.data.tempToken as string;
      expect((await anon().post("/auth/mfa/request-email-otp").send({ tempToken: temp })).status).toBe(401);
      expect((await anon().post("/auth/mfa/verify").send({ tempToken: temp, method: "email", code: "123456" })).status).toBe(401);
      expect((await anon().post("/auth/mfa/webauthn/start").send({ tempToken: temp })).status).toBe(401);
      expect((await anon().post("/auth/mfa/verify").send({ tempToken: temp, method: "sms", code: "123456" })).status).toBe(422);
      expect((await anon().post("/auth/mfa/request-email-otp").send({ tempToken: "bad" })).status).toBe(401);
    });

    it("email OTP completes login when email is an enrolled factor", async () => {
      const u = await userWithTotp();
      await t.db.query(
        `UPDATE "${schemaOf(tenant.slug)}".mfa_settings SET email_enabled = true WHERE user_id = (SELECT id FROM "${schemaOf(tenant.slug)}".users WHERE email = $1)`,
        [u.email],
      );
      const login = await loginUser(t, tenant, u.email, u.password);
      expect(login.res.body.data.availableMethods).toEqual(expect.arrayContaining(["totp", "email"]));
      t.mail.clear();
      const temp = login.res.body.data.tempToken as string;
      expect((await anon().post("/auth/mfa/request-email-otp").send({ tempToken: temp })).status).toBe(200);
      const code = String(t.mail.last(u.email, "otp-code")!.props["code"]);
      const wrong = await anon().post("/auth/mfa/verify").send({ tempToken: temp, method: "email", code: code === "000000" ? "111111" : "000000" });
      expect(wrong.status).toBe(401);
      const ok = await anon().post("/auth/mfa/verify").send({ tempToken: temp, method: "email", code });
      expect(ok.status).toBe(200);
      expect(amrOf(cookieValue(cookiesOf(ok), "accessToken"))).toEqual(["pwd", "otp", "mfa"]);
      const again = await anon().post("/auth/mfa/verify").send({ tempToken: temp, method: "email", code });
      expect(again.status).toBe(401);
    });
  });

  describe("step-up (POST /auth/reauth)", () => {
    const stale = async (email: string, password: string) => {
      const s = await loginUser(t, tenant, email, password);
      await t.db.query(
        `UPDATE "${schemaOf(tenant.slug)}".sessions SET created_at = now() - interval '2 hours' WHERE user_id = (SELECT id FROM "${schemaOf(tenant.slug)}".users WHERE email = $1)`,
        [email],
      );
      const refreshed = await t.http({ tenant: tenant.slug, cookies: s.cookies }).post("/auth/refresh");
      expect(refreshed.status).toBe(200);
      return [...s.cookies.filter((c) => !/^(accessToken|refreshToken)=/.test(c)), ...cookiesOf(refreshed)];
    };
    const guarded = (cookies: string[]) =>
      t.http({ tenant: tenant.slug, cookies }).post("/users/me/change-password").send({ currentPassword: "wrong-current", newPassword: "Another-Str0ng-Pass!9" });

    it("a stale session is refused, reauth with the password refreshes authTime on the SAME session", async () => {
      const u = await registerAndVerifyUser(t, tenant);
      const cookies = await stale(u.email, u.password);
      expect((await guarded(cookies)).body.code).toBe("ACCESS_RECENT_AUTH_REQUIRED");

      expect((await t.http({ tenant: tenant.slug, cookies }).post("/auth/reauth").send({ method: "password", password: "wrong-pass-123" })).status).toBe(401);
      expect((await guarded(cookies)).body.code).toBe("ACCESS_RECENT_AUTH_REQUIRED");

      const sessionsBefore = await t.db.query(`SELECT count(*)::int AS n FROM "${schemaOf(tenant.slug)}".sessions`);
      const ok = await t.http({ tenant: tenant.slug, cookies }).post("/auth/reauth").send({ method: "password", password: u.password });
      expect(ok.status).toBe(200);
      expect(JSON.stringify(ok.body)).not.toMatch(/eyJ/);
      const sessionsAfter = await t.db.query(`SELECT count(*)::int AS n FROM "${schemaOf(tenant.slug)}".sessions`);
      expect(sessionsAfter[0].n).toBe(sessionsBefore[0].n);

      const fresh = [...cookies.filter((c) => !c.startsWith("accessToken=")), ...cookiesOf(ok).filter((c) => c.startsWith("accessToken="))];
      expect((await guarded(fresh)).body.code).not.toBe("ACCESS_RECENT_AUTH_REQUIRED");

      // a later refresh keeps the step-up
      const refreshed = await t.http({ tenant: tenant.slug, cookies: fresh }).post("/auth/refresh");
      expect(refreshed.status).toBe(200);
      const after = [...fresh.filter((c) => !/^(accessToken|refreshToken)=/.test(c)), ...cookiesOf(refreshed)];
      expect((await guarded(after)).body.code).not.toBe("ACCESS_RECENT_AUTH_REQUIRED");
    });

    it("reauth with TOTP works and requires authentication", async () => {
      const u = await registerAndVerifyUser(t, tenant);
      const s = await loginUser(t, tenant, u.email, u.password);
      const http = t.http({ tenant: tenant.slug, cookies: s.cookies });
      const secret: string = (await http.post("/mfa/setup/totp")).body.data.secret;
      expect((await http.post("/mfa/verify/totp").send({ token: totp(secret) })).status).toBe(200);
      const next = totp(secret, 1);
      expect((await http.post("/auth/reauth").send({ method: "totp", code: "000000" })).status).toBe(401);
      const ok = await http.post("/auth/reauth").send({ method: "totp", code: next });
      expect(ok.status).toBe(200);
      expect(amrOf(cookieValue(cookiesOf(ok), "accessToken"))).toEqual(expect.arrayContaining(["pwd", "totp"]));
      expect((await anon().post("/auth/reauth").send({ method: "password", password: "x" })).status).toBe(401);
      expect((await http.post("/auth/reauth").send({ method: "password" })).status).toBe(422);
    });
  });
});

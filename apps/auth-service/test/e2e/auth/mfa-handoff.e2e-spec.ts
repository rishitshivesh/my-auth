import * as speakeasy from "speakeasy";
import {
  cookieValue,
  cookiesOf,
  createTenant,
  createTestApp,
  loginUser,
  registerAndVerifyUser,
  type TenantFixture,
  type TestApp,
} from "../support";

describe("MFA-required login hand-off", () => {
  let t: TestApp;
  let tenant: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());

  async function userWithTotp(): Promise<{ email: string; password: string; secret: string }> {
    const u = await registerAndVerifyUser(t, tenant);
    const s = await loginUser(t, tenant, u.email, u.password);
    const http = t.http({ tenant: tenant.slug, cookies: s.cookies });
    const setup = await http.post("/mfa/setup/totp");
    expect(setup.status).toBeLessThan(300);
    const secret: string = setup.body.data.secret;
    const enable = await http.post("/mfa/verify/totp").send({ token: speakeasy.totp({ secret, encoding: "base32" }) });
    expect(enable.status).toBe(200);
    return { ...u, secret };
  }

  it("returns mfaRequired + tempToken and NO session cookies until the code is verified", async () => {
    const u = await userWithTotp();
    const { res, cookies } = await loginUser(t, tenant, u.email, u.password);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mfaRequired: true, tempToken: expect.any(String) });
    expect(res.body.data.availableMethods).toContain("totp");
    expect(cookieValue(cookies, "accessToken")).toBe("");
    expect(cookieValue(cookies, "refreshToken")).toBe("");

    // The temp token is not an access token.
    const me = await t.http({ tenant: tenant.slug, bearer: res.body.data.tempToken }).get("/auth/me");
    expect(me.status).toBe(401);
  });

  it("completes login with a valid TOTP code", async () => {
    const u = await userWithTotp();
    const login = await loginUser(t, tenant, u.email, u.password);
    const code = speakeasy.totp({ secret: u.secret, encoding: "base32", time: Date.now() / 1000 + 30 });

    const res = await t
      .http({ tenant: tenant.slug })
      .post("/auth/mfa/verify")
      .send({ tempToken: login.res.body.data.tempToken, code });
    expect([200, 401]).toContain(res.status); // +30s code can be rejected by a strict window; assert on current code below
    const ok =
      res.status === 200
        ? res
        : await t.http({ tenant: tenant.slug }).post("/auth/mfa/verify").send({
            tempToken: (await loginUser(t, tenant, u.email, u.password)).res.body.data.tempToken,
            code: speakeasy.totp({ secret: u.secret, encoding: "base32" }),
          });
    expect(ok.status).toBe(200);
    const cookies = cookiesOf(ok);
    expect(cookieValue(cookies, "accessToken")).not.toBe("");
    expect((await t.http({ tenant: tenant.slug, cookies }).get("/auth/me")).status).toBe(200);
  });

  it("rejects a wrong code with 401 and sets no cookies", async () => {
    const u = await userWithTotp();
    const login = await loginUser(t, tenant, u.email, u.password);
    const res = await t
      .http({ tenant: tenant.slug })
      .post("/auth/mfa/verify")
      .send({ tempToken: login.res.body.data.tempToken, code: "000000" });
    expect(res.status).toBe(401);
    expect(cookiesOf(res)).toHaveLength(0);
  });

  it("rejects a garbage temp token", async () => {
    const res = await t.http({ tenant: tenant.slug }).post("/auth/mfa/verify").send({ tempToken: "garbage", code: "123456" });
    expect(res.status).toBe(401);
  });
});

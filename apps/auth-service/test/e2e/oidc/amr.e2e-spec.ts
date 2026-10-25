import * as speakeasy from "speakeasy";
import {
  clearRateLimits,
  cookiesOf,
  cookieValue,
  createTenant,
  createTestApp,
  extractLink,
  loginUser,
  mergeCookies,
  registerAndVerifyUser,
  tokenFromLink,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";
import { basic, createClient, decodeJwt, pkcePair, tenantSchema, REDIRECT, type ClientFixture } from "../oauth/oauth-util";

/** The amr/auth_time a login completed with must reach the session, the code and the ID token. */
describe("OIDC amr and auth_time per login method", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let client: ClientFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
    client = await createClient(t, tenant, { clientType: "public", grantTypes: ["authorization_code", "refresh_token"] });
    await t.db.query(`UPDATE "${tenantSchema(tenant.slug)}".oauth_clients SET is_first_party = true, require_consent = false WHERE id = $1`, [client.id]);
  });
  beforeEach(() => clearRateLimits(t));
  afterAll(() => t.close());

  /** Runs /oauth/authorize + /oauth/token with the given browser cookies and returns the ID token claims. */
  async function idTokenFor(cookies: string[]): Promise<Record<string, unknown>> {
    const { verifier, challenge } = pkcePair();
    const auth = await t.http({ tenant: tenant.slug, cookies }).get("/oauth/authorize").query({
      client_id: client.clientId, redirect_uri: REDIRECT, response_type: "code", scope: "openid email",
      code_challenge: challenge, code_challenge_method: "S256",
    });
    expect(auth.status).toBe(302);
    const code = new URL(auth.headers["location"] as string).searchParams.get("code");
    expect(code).toBeTruthy();
    const tokens = await t.http({ tenant: tenant.slug }).post("/oauth/token").type("form").send({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: verifier,
    });
    expect(tokens.status).toBe(200);
    return decodeJwt(tokens.body.id_token).payload as Record<string, unknown>;
  }

  async function userWithTotp(): Promise<UserFixture & { secret: string; backupCodes: string[] }> {
    const u = await registerAndVerifyUser(t, tenant);
    const http = t.http({ tenant: tenant.slug, cookies: (await loginUser(t, tenant, u.email, u.password)).cookies });
    const secret: string = (await http.post("/mfa/setup/totp")).body.data.secret;
    const enable = await http.post("/mfa/verify/totp").send({ token: speakeasy.totp({ secret, encoding: "base32" }) });
    expect(enable.status).toBe(200);
    return { ...u, secret, backupCodes: enable.body.data.backupCodes as string[] };
  }

  const nowSeconds = (): number => Math.floor(Date.now() / 1000);

  it("password login reports amr [pwd] and a current auth_time", async () => {
    const u = await registerAndVerifyUser(t, tenant);
    const { cookies } = await loginUser(t, tenant, u.email, u.password);
    const claims = await idTokenFor(cookies);
    expect(claims["amr"]).toEqual(["pwd"]);
    expect(Math.abs((claims["auth_time"] as number) - nowSeconds())).toBeLessThan(60);
  });

  it("TOTP step-up reports pwd, otp, totp, mfa and survives a token refresh", async () => {
    const u = await userWithTotp();
    const login = await loginUser(t, tenant, u.email, u.password);
    const verify = async (code: string) =>
      t.http({ tenant: tenant.slug }).post("/auth/mfa/verify").send({ tempToken: login.res.body.data.tempToken, code });
    let res = await verify(speakeasy.totp({ secret: u.secret, encoding: "base32", time: Date.now() / 1000 + 30 }));
    if (res.status !== 200) {
      const again = await loginUser(t, tenant, u.email, u.password);
      res = await t.http({ tenant: tenant.slug }).post("/auth/mfa/verify").send({ tempToken: again.res.body.data.tempToken, code: speakeasy.totp({ secret: u.secret, encoding: "base32", time: Date.now() / 1000 + 60 }) });
    }
    expect(res.status).toBe(200);
    const cookies = cookiesOf(res);
    expect((await idTokenFor(cookies))["amr"]).toEqual(["pwd", "otp", "totp", "mfa"]);

    const refreshed = await t.http({ tenant: tenant.slug, cookies }).post("/auth/refresh");
    expect(refreshed.status).toBe(200);
    const next = mergeCookies(cookies, cookiesOf(refreshed));
    expect((await idTokenFor(next))["amr"]).toEqual(["pwd", "otp", "totp", "mfa"]);
  });

  it("backup-code step-up reports pwd, backup_code, mfa", async () => {
    const u = await userWithTotp();
    const login = await loginUser(t, tenant, u.email, u.password);
    const res = await t.http({ tenant: tenant.slug }).post("/auth/mfa/verify-backup").send({ tempToken: login.res.body.data.tempToken, code: u.backupCodes[0] });
    expect(res.status).toBe(200);
    expect((await idTokenFor(cookiesOf(res)))["amr"]).toEqual(["pwd", "backup_code", "mfa"]);
  });

  it("magic-link sign-in reports amr [magic_link]", async () => {
    const u = await registerAndVerifyUser(t, tenant);
    t.mail.clear();
    expect((await t.http({ tenant: tenant.slug }).post("/auth/magic-link/send").send({ email: u.email })).status).toBe(200);
    const token = tokenFromLink(extractLink(t.mail.last(u.email, "magic-link")!, "/u/magic-link"));
    const verified = await t.http({ tenant: tenant.slug }).post("/auth/magic-link/verify").send({ token });
    expect(verified.status).toBe(200);
    expect((await idTokenFor(cookiesOf(verified)))["amr"]).toEqual(["magic_link"]);
  });
});

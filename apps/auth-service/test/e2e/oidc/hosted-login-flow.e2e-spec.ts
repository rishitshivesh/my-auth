import {
  createTenant,
  createTestApp,
  clearRateLimits,
  cookiesOf,
  loginUser,
  mergeCookies,
  registerAndVerifyUser,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";
import { isSafeAuthorizeContinue } from "@/modules/oauth/authorize-continue";
import {
  basic,
  createClient,
  decodeJwt,
  pkcePair,
  tenantSchema,
  REDIRECT,
  type ClientFixture,
} from "../oauth/oauth-util";

const LOGOUT_REDIRECT = "https://app.example.com/logged-out";
const FRONTEND = process.env["FRONTEND_URL"] ?? "http://localhost:3000";

/** Full browser authorization-code flow against the real app, session carried by cookies. */
describe("OIDC hosted-login flow", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let user: UserFixture;
  let cookies: string[];
  let publicClient: ClientFixture;
  let confidential: ClientFixture;
  let thirdParty: ClientFixture;

  const http = (jar: string[] = cookies) => t.http({ tenant: tenant.slug, cookies: jar });
  const schema = () => tenantSchema(tenant.slug);

  const authorize = (params: Record<string, string>, jar: string[] = cookies) =>
    http(jar).get("/oauth/authorize").query(params);

  const baseParams = (client: ClientFixture, extra: Record<string, string> = {}): Record<string, string> => ({
    client_id: client.clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid email",
    ...extra,
  });

  const codeFrom = (location: string): string => {
    const code = new URL(location).searchParams.get("code");
    if (!code) throw new Error(`no code in ${location}`);
    return code;
  };

  const exchange = (client: ClientFixture, code: string, verifier?: string) => {
    const req = t.http({ tenant: tenant.slug }).post("/oauth/token").type("form");
    if (client.clientSecret) req.set("authorization", basic(client.clientId, client.clientSecret));
    return req.send({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      ...(client.clientSecret ? {} : { client_id: client.clientId }),
      ...(verifier ? { code_verifier: verifier } : {}),
    });
  };

  const markFirstParty = (client: ClientFixture) =>
    t.db.query(`UPDATE "${schema()}".oauth_clients SET is_first_party = true, require_consent = false WHERE id = $1`, [client.id]);

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
    user = await registerAndVerifyUser(t, tenant);
    cookies = (await loginUser(t, tenant, user.email, user.password)).cookies;

    const common = { postLogoutRedirectUris: [LOGOUT_REDIRECT] };
    publicClient = await createClient(t, tenant, {
      ...common,
      clientType: "public",
      grantTypes: ["authorization_code", "refresh_token"],
    });
    confidential = await createClient(t, tenant, common);
    thirdParty = await createClient(t, tenant, { ...common, name: "third party" });
    await markFirstParty(publicClient);
    await markFirstParty(confidential);
  });
  beforeEach(() => clearRateLimits(t));
  afterAll(() => t.close());

  it("advertises end_session_endpoint in discovery", async () => {
    const res = await t.http().get("/.well-known/openid-configuration");
    expect(res.body.end_session_endpoint).toMatch(/\/oauth\/end_session$/);
    expect(res.body.prompt_values_supported).toEqual(expect.arrayContaining(["none", "login", "consent"]));
  });

  describe("authorize -> token -> userinfo -> refresh -> revoke -> end_session", () => {
    it("completes the whole flow and ends the session", async () => {
      const { verifier, challenge } = pkcePair();
      const auth = await authorize(
        baseParams(publicClient, { state: "st-1", nonce: "n-1", code_challenge: challenge, code_challenge_method: "S256" }),
      );
      expect(auth.status).toBe(302);
      const redirect = new URL(auth.headers["location"] as string);
      expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT);
      expect(redirect.searchParams.get("state")).toBe("st-1");

      // The code is bound to the session, auth_time and amr in the database.
      const rows = await t.db.query(
        `SELECT session_id, auth_time, amr, nonce FROM "${schema()}".oauth_authorization_codes WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [publicClient.id],
      );
      expect(rows[0].session_id).toBeTruthy();
      expect(rows[0].auth_time).toBeTruthy();
      expect(rows[0].amr).toBe("pwd");
      expect(rows[0].nonce).toBe("n-1");

      const tokens = await exchange(publicClient, codeFrom(auth.headers["location"] as string), verifier);
      expect(tokens.status).toBe(200);
      const idToken = decodeJwt(tokens.body.id_token).payload;
      expect(idToken).toMatchObject({
        aud: publicClient.clientId,
        nonce: "n-1",
        sid: rows[0].session_id,
        acr: "1",
        amr: ["pwd"],
        email: user.email,
      });
      expect(typeof idToken["auth_time"]).toBe("number");

      const userinfo = await t.http({ tenant: tenant.slug, bearer: tokens.body.access_token }).get("/oauth/userinfo");
      expect(userinfo.status).toBe(200);
      expect(userinfo.body.sub).toBe(idToken["sub"]);

      const refreshed = await t
        .http({ tenant: tenant.slug })
        .post("/oauth/token")
        .type("form")
        .send({ grant_type: "refresh_token", refresh_token: tokens.body.refresh_token, client_id: publicClient.clientId });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.refresh_token).not.toBe(tokens.body.refresh_token);

      // Confidential-client revocation: the refreshed token stops working.
      const revoked = await t
        .http({ tenant: tenant.slug })
        .post("/oauth/revoke")
        .set("authorization", basic(confidential.clientId, confidential.clientSecret!))
        .send({ token: refreshed.body.refresh_token, token_type_hint: "refresh_token" });
      expect(revoked.status).toBe(200);
      const afterRevoke = await t
        .http({ tenant: tenant.slug })
        .post("/oauth/token")
        .type("form")
        .send({ grant_type: "refresh_token", refresh_token: refreshed.body.refresh_token, client_id: publicClient.clientId });
      expect(afterRevoke.status).toBe(400);
      expect(afterRevoke.body.error).toBe("invalid_grant");

      // RP-initiated logout on a separate login so the shared session survives.
      const jar = (await loginUser(t, tenant, user.email, user.password)).cookies;
      const second = await authorize(
        baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }),
        jar,
      );
      const secondTokens = await exchange(publicClient, codeFrom(second.headers["location"] as string), verifier);
      const end = await http(jar)
        .get("/oauth/end_session")
        .query({
          id_token_hint: secondTokens.body.id_token,
          post_logout_redirect_uri: LOGOUT_REDIRECT,
          state: "bye",
        });
      expect(end.status).toBe(302);
      const endLocation = new URL(end.headers["location"] as string);
      expect(`${endLocation.origin}${endLocation.pathname}`).toBe(LOGOUT_REDIRECT);
      expect(endLocation.searchParams.get("state")).toBe("bye");
      expect(cookiesOf(end).some((c) => c.startsWith("accessToken=;"))).toBe(true);

      const reuse = await authorize(baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }), jar);
      expect(reuse.status).toBe(302);
      expect(reuse.headers["location"]).toContain(`${FRONTEND}/u/login`);

      const dead = await t.http({ tenant: tenant.slug, bearer: secondTokens.body.access_token }).get("/oauth/userinfo");
      expect(dead.status).toBe(401);
      const deadRefresh = await t
        .http({ tenant: tenant.slug })
        .post("/oauth/token")
        .type("form")
        .send({ grant_type: "refresh_token", refresh_token: secondTokens.body.refresh_token, client_id: publicClient.clientId });
      expect(deadRefresh.status).toBe(400);
    });
  });

  describe("unauthenticated and prompt handling", () => {
    it("redirects anonymous users to the tenant login UI with a safe same-origin continue URL", async () => {
      const { challenge } = pkcePair();
      const params = baseParams(publicClient, { state: "s", code_challenge: challenge, code_challenge_method: "S256" });
      const res = await authorize(params, []);
      expect(res.status).toBe(302);
      const login = new URL(res.headers["location"] as string);
      expect(`${login.origin}${login.pathname}`).toBe(`${FRONTEND}/u/login`);
      expect(login.searchParams.get("tenant")).toBe(tenant.slug);
      const cont = login.searchParams.get("continue")!;
      expect(isSafeAuthorizeContinue(cont)).toBe(true);
      expect(new URLSearchParams(cont.split("?")[1]).get("redirect_uri")).toBe(REDIRECT);

      // Following `continue` once signed in completes the flow.
      const done = await authorize(Object.fromEntries(new URLSearchParams(cont.split("?")[1])));
      expect(done.status).toBe(302);
      expect(done.headers["location"]).toContain("code=");
    });

    it("never builds the login redirect from a hostile request URL", async () => {
      const { challenge } = pkcePair();
      const res = await http([])
        .get("/oauth/authorize")
        .query({ ...baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }), continue: "https://evil.example.com" });
      const login = new URL(res.headers["location"] as string);
      expect(login.searchParams.get("continue")).not.toContain("evil");
    });

    it("prompt=none without a session returns login_required via the redirect_uri", async () => {
      const { challenge } = pkcePair();
      const res = await authorize(
        baseParams(publicClient, { prompt: "none", state: "pn", code_challenge: challenge, code_challenge_method: "S256" }),
        [],
      );
      expect(res.status).toBe(302);
      const u = new URL(res.headers["location"] as string);
      expect(`${u.origin}${u.pathname}`).toBe(REDIRECT);
      expect(u.searchParams.get("error")).toBe("login_required");
      expect(u.searchParams.get("state")).toBe("pn");
    });

    it("prompt=none with a session issues a code silently", async () => {
      const { challenge } = pkcePair();
      const res = await authorize(baseParams(publicClient, { prompt: "none", code_challenge: challenge, code_challenge_method: "S256" }));
      expect(res.headers["location"]).toContain("code=");
    });

    it("rejects prompt=none combined with another prompt value", async () => {
      const res = await authorize(baseParams(confidential, { prompt: "none login" }));
      expect(res.status).toBe(400);
    });

    it("prompt=login forces re-authentication and does not loop once the user logged in again", async () => {
      const { challenge } = pkcePair();
      const res = await authorize(baseParams(publicClient, { prompt: "login", code_challenge: challenge, code_challenge_method: "S256" }));
      const login = new URL(res.headers["location"] as string);
      expect(login.pathname).toBe("/u/login");
      const cont = new URLSearchParams(login.searchParams.get("continue")!.split("?")[1]);
      expect(Number(cont.get("auth_after"))).toBeGreaterThan(0);

      // A session older than auth_after is rejected again.
      const stale = await authorize({ ...Object.fromEntries(cont), auth_after: String(Math.floor(Date.now() / 1000) + 3600) });
      expect(stale.headers["location"]).toContain("/u/login");

      // A fresh login satisfies it.
      const fresh = (await loginUser(t, tenant, user.email, user.password)).cookies;
      const ok = await authorize(Object.fromEntries(cont), mergeCookies(cookies, fresh));
      expect(ok.headers["location"]).toContain("code=");
    });

    it("max_age re-authenticates a session that is older than allowed", async () => {
      const jar = (await loginUser(t, tenant, user.email, user.password)).cookies;
      await new Promise((r) => setTimeout(r, 1100));
      const { challenge } = pkcePair();
      const params = baseParams(publicClient, { max_age: "0", code_challenge: challenge, code_challenge_method: "S256" });
      const res = await authorize(params, jar);
      expect(res.headers["location"]).toContain("/u/login");
      const none = await authorize({ ...params, prompt: "none" }, jar);
      expect(new URL(none.headers["location"] as string).searchParams.get("error")).toBe("login_required");
    });
  });

  describe("consent", () => {
    const consentTxFrom = (location: string): string => {
      const u = new URL(location);
      expect(`${u.origin}${u.pathname}`).toBe(`${FRONTEND}/u/consent`);
      return u.searchParams.get("transaction_id")!;
    };

    it("redirects to the consent screen, protects the decision with a CSRF token, then remembers it", async () => {
      const params = baseParams(thirdParty, { state: "c1" });
      const first = await authorize(params);
      expect(first.status).toBe(302);
      const txId = consentTxFrom(first.headers["location"] as string);

      // The details endpoint needs the session and yields the CSRF token.
      expect((await t.http({ tenant: tenant.slug }).get(`/oauth/consent/${txId}`)).status).toBe(401);
      const details = await http().get(`/oauth/consent/${txId}`);
      expect(details.status).toBe(200);
      expect(details.body.client.name).toBe("third party");
      expect(details.body.scopes).toEqual(["openid", "email"]);
      const csrf = details.body.csrf_token as string;

      const decide = (jar: string[], body: Record<string, unknown>) => http(jar).post("/oauth/consent").send(body);
      // No session, wrong or missing CSRF token: nothing is granted.
      expect((await decide([], { transaction_id: txId, csrf_token: csrf, decision: "allow" })).status).toBe(401);
      expect((await decide(cookies, { transaction_id: txId, csrf_token: "forged", decision: "allow" })).status).toBe(400);
      expect((await decide(cookies, { transaction_id: txId, decision: "allow" })).status).toBe(422);

      const allowed = await decide(cookies, { transaction_id: txId, csrf_token: csrf, decision: "allow", remember: true });
      expect(allowed.status).toBe(200);
      const target = new URL(allowed.body.redirect_to);
      expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
      expect(target.searchParams.get("state")).toBe("c1");
      expect(target.searchParams.get("code")).toBeTruthy();

      // One decision per transaction.
      expect((await decide(cookies, { transaction_id: txId, csrf_token: csrf, decision: "allow" })).status).toBe(400);

      // Remembered: the next authorize skips consent.
      const again = await authorize(params);
      expect(again.headers["location"]).toContain("code=");

      // prompt=consent forces the screen anyway.
      const forced = await authorize({ ...params, prompt: "consent" });
      consentTxFrom(forced.headers["location"] as string);
    });

    it("deny redirects with access_denied and prompt=none reports consent_required", async () => {
      const other = await createClient(t, tenant, { name: "other third party" });
      const params = baseParams(other, { state: "c2" });
      const none = await authorize({ ...params, prompt: "none" });
      expect(new URL(none.headers["location"] as string).searchParams.get("error")).toBe("consent_required");

      const txId = consentTxFrom((await authorize(params)).headers["location"] as string);
      const details = await http().get(`/oauth/consent/${txId}`);
      const denied = await http().post("/oauth/consent").send({
        transaction_id: txId,
        csrf_token: details.body.csrf_token,
        decision: "deny",
      });
      expect(denied.status).toBe(200);
      const u = new URL(denied.body.redirect_to);
      expect(u.searchParams.get("error")).toBe("access_denied");
      expect(u.searchParams.get("state")).toBe("c2");
      expect(u.searchParams.has("code")).toBe(false);
    });

    it("refuses a consent transaction that belongs to another user's session", async () => {
      const other = await registerAndVerifyUser(t, tenant);
      const otherJar = (await loginUser(t, tenant, other.email, other.password)).cookies;
      const client = await createClient(t, tenant, { name: "tx owner check" });
      const txId = consentTxFrom((await authorize(baseParams(client))).headers["location"] as string);
      expect((await http(otherJar).get(`/oauth/consent/${txId}`)).status).toBe(400);
    });
  });

  describe("negative cases", () => {
    it("never redirects to an unregistered redirect_uri", async () => {
      const res = await authorize(baseParams(confidential, { redirect_uri: "https://evil.example.com/cb" }));
      expect(res.status).toBe(400);
      expect(res.headers["location"]).toBeUndefined();
      expect(res.body.error).toBe("invalid_request");
    });

    it("requires PKCE for public clients", async () => {
      const res = await authorize(baseParams(publicClient));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
    });

    it("rejects a replayed code and a wrong code_verifier", async () => {
      const { verifier, challenge } = pkcePair();
      const params = baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" });
      const code = codeFrom((await authorize(params)).headers["location"] as string);

      const wrong = await exchange(publicClient, code, pkcePair().verifier);
      expect(wrong.status).toBe(400);
      expect(wrong.body.error).toBe("invalid_grant");

      expect((await exchange(publicClient, code, verifier)).status).toBe(200);
      const replay = await exchange(publicClient, code, verifier);
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe("invalid_grant");
    });

    it("end_session validates id_token_hint and post_logout_redirect_uri", async () => {
      const { verifier, challenge } = pkcePair();
      const jar = (await loginUser(t, tenant, user.email, user.password)).cookies;
      const code = codeFrom(
        (await authorize(baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }), jar)).headers["location"] as string,
      );
      const tokens = await exchange(publicClient, code, verifier);

      const unregistered = await http(jar).get("/oauth/end_session").query({
        id_token_hint: tokens.body.id_token,
        post_logout_redirect_uri: "https://evil.example.com/bye",
      });
      expect(unregistered.status).toBe(400);
      expect(unregistered.headers["location"]).toBeUndefined();

      const noHint = await http(jar).get("/oauth/end_session").query({ post_logout_redirect_uri: LOGOUT_REDIRECT });
      expect(noHint.status).toBe(400);

      const accessAsHint = await http(jar).get("/oauth/end_session").query({ id_token_hint: tokens.body.access_token });
      expect(accessAsHint.status).toBe(400);

      const parts = (tokens.body.id_token as string).split(".");
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ ...decodeJwt(tokens.body.id_token).payload, sub: "x" })).toString("base64url")}.${parts[2]}`;
      expect((await http(jar).get("/oauth/end_session").query({ id_token_hint: tampered })).status).toBe(400);

      // Nothing above ended the session; a bare end_session only asks the UI to confirm.
      const bare = await http(jar).get("/oauth/end_session");
      expect(bare.status).toBe(302);
      expect(bare.headers["location"]).toContain(`${FRONTEND}/u/logout`);
      const still = await authorize(baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }), jar);
      expect(still.headers["location"]).toContain("code=");
    });

    it("end_session supports POST form submissions", async () => {
      const { verifier, challenge } = pkcePair();
      const jar = (await loginUser(t, tenant, user.email, user.password)).cookies;
      const code = codeFrom(
        (await authorize(baseParams(publicClient, { code_challenge: challenge, code_challenge_method: "S256" }), jar)).headers["location"] as string,
      );
      const tokens = await exchange(publicClient, code, verifier);
      const res = await http(jar).post("/oauth/end_session").type("form").send({
        id_token_hint: tokens.body.id_token,
        post_logout_redirect_uri: LOGOUT_REDIRECT,
      });
      expect(res.status).toBe(302);
      expect(res.headers["location"]).toBe(LOGOUT_REDIRECT);
    });
  });
});

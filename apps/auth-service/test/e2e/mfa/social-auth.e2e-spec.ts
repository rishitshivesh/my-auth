import passport from "passport";
import { createTestApp, createTenant, extractLink, loginUser, registerAndVerifyUser, tokenFromLink, uniqueEmail, STRONG_PASSWORD, cookieValue, cookiesOf, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, auditItems, type Member } from "../_shared/fixtures";

interface ProviderProfile {
  id: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails: Array<{ value: string; verified?: boolean; primary?: boolean }>;
  photos?: Array<{ value: string }>;
  _json?: Record<string, unknown>;
}

/** The OAuth2 strategies call out to the provider; replace exactly those two network hops. */
interface StubbableStrategy {
  _oauth2: { getOAuthAccessToken: (code: string, params: unknown, cb: (err: unknown, access?: string, refresh?: string, extra?: unknown) => void) => void };
  userProfile: (accessToken: string, done: (err: unknown, profile?: ProviderProfile) => void) => void;
}
const strategyOf = (name: string): StubbableStrategy => (passport as unknown as { _strategy(n: string): StubbableStrategy })._strategy(name);

function stubProvider(name: "google" | "github" | "microsoft", profile: ProviderProfile | Error): void {
  const s = strategyOf(name);
  s._oauth2.getOAuthAccessToken = (_code, _params, cb) => cb(null, "provider-access-token", "provider-refresh-token", {});
  s.userProfile = (_token, done) => (profile instanceof Error ? done(profile) : done(null, profile));
}

const stateOf = (data: Record<string, unknown>): string => Buffer.from(JSON.stringify(data)).toString("base64url");
const PORTAL = "http://localhost:3000";

describe("social auth", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let member: Member;

  beforeAll(async () => {
    for (const p of ["GOOGLE", "GITHUB", "MICROSOFT"]) {
      process.env[`INTERNAL_${p}_CLIENT_ID`] ||= `e2e-${p.toLowerCase()}-client`;
      process.env[`INTERNAL_${p}_CLIENT_SECRET`] ||= `e2e-${p.toLowerCase()}-secret`;
      process.env[`INTERNAL_${p}_CALLBACK_URL`] ||= `http://localhost:4000/auth/social/${p.toLowerCase()}/callback`;
    }
    t = await createTestApp();
    fx = await createTenant(t);
    member = await addMember(t, fx, "member");
  });
  afterAll(async () => {
    await t.close();
  });

  const googleProfile = (email: string, id = `g-${Math.random().toString(16).slice(2)}`, verified = true): ProviderProfile => ({
    id,
    displayName: "Gina Google",
    name: { givenName: "Gina", familyName: "Google" },
    emails: [{ value: email, verified }],
    photos: [{ value: "https://example.com/a.png" }],
    _json: { sub: id },
  });

  interface Begun {
    state: string;
    cookies: string[];
  }
  const stateOfLocation = (res: { headers: Record<string, unknown> }): string =>
    new URL(String(res.headers["location"])).searchParams.get("state") ?? "";

  /** Starts a real login: signed state in the redirect plus the browser-binding nonce cookie. */
  const begin = async (provider: string, o: { tenantId?: string; returnUrl?: string } = {}): Promise<Begun> => {
    const res = await t
      .http({ tenant: fx.slug })
      .get(`/auth/social/${provider}/login?tenant_id=${o.tenantId ?? fx.tenantId}&return_url=${encodeURIComponent(o.returnUrl ?? PORTAL)}`);
    expect(res.status).toBe(302);
    return { state: stateOfLocation(res), cookies: cookiesOf(res) };
  };
  const finish = (provider: string, b: Begun) =>
    t.http({ tenant: fx.slug, cookies: b.cookies }).get(`/auth/social/${provider}/callback?code=authcode&state=${encodeURIComponent(b.state)}`);
  const callback = async (provider: string, spec: { tenantId?: string; returnUrl?: string } | string = {}) =>
    typeof spec === "string"
      ? finish(provider, { state: spec, cookies: (await begin(provider)).cookies })
      : finish(provider, await begin(provider, spec));
  const tenantState = (extra: { tenantId?: string; returnUrl?: string } = {}) => extra;
  const location = (res: { headers: Record<string, unknown> }): string => String(res.headers["location"] ?? "");

  describe("login redirects", () => {
    it.each(["google", "github", "microsoft"])("GET /auth/social/%s/login redirects to the provider with a state", async (p) => {
      const res = await t.http({ tenant: fx.slug }).get(`/auth/social/${p}/login?tenant_id=${fx.tenantId}&return_url=${encodeURIComponent(PORTAL)}`);
      expect(res.status).toBe(302);
      const loc = new URL(location(res));
      expect(loc.searchParams.get("client_id")).toBeTruthy();
      const [body, sig] = (loc.searchParams.get("state") ?? "").split(".");
      expect(JSON.parse(Buffer.from(body!, "base64url").toString()).tenantId).toBe(fx.tenantId);
      expect(sig).toBeTruthy();
      expect(cookiesOf(res).some((c) => c.startsWith("social_state_nonce="))).toBe(true);
    });
  });

  describe("callback: new user", () => {
    it("creates a verified user, sets the refresh cookie, and the completion token claims a working session", async () => {
      const email = uniqueEmail("gnew");
      stubProvider("google", googleProfile(email));
      const res = await callback("google", tenantState());
      expect(res.status).toBe(302);
      expect(location(res)).toMatch(new RegExp(`^${PORTAL}/u/auth/callback\\?ct=`));
      expect(cookiesOf(res).some((c) => c.startsWith("refreshToken="))).toBe(true);

      const ct = new URL(location(res)).searchParams.get("ct")!;
      const claim = await t.http({ tenant: fx.slug }).post("/auth/social/claim-session").send({ ct });
      expect(claim.status).toBe(200);
      const access = cookieValue(cookiesOf(claim), "accessToken");
      expect(access).toBeTruthy();
      const me = await as(t, fx.slug, access).get("/users/me");
      expect(me.body.data.email).toBe(email);
      expect(me.body.data.emailVerified).toBe(true);

      // The audit event lands in the tenant schema (fire-and-forget write: poll briefly).
      const schema = `fk_${fx.slug.replace(/-/g, "_")}`;
      let rows: Array<{ event_type: string }> = [];
      for (let i = 0; i < 20 && rows.length === 0; i++) {
        rows = await t.db.query(
          `SELECT event_type FROM "${schema}".security_events WHERE event_type = 'social.user_created' AND actor_email = $1`,
          [email],
        );
        if (rows.length === 0) await new Promise((r) => setTimeout(r, 100));
      }
      expect(rows).toHaveLength(1);

      // The session records how the user authenticated (OIDC amr).
      const sessions = await t.db.query(`SELECT s.amr FROM "${schema}".sessions s JOIN "${schema}".users u ON u.id = s.user_id WHERE u.email = $1`, [email]);
      expect(sessions.map((r: { amr: string }) => r.amr)).toContain("social");
    });

    it("an unverified provider email never creates an account", async () => {
      const email = uniqueEmail("gunv");
      stubProvider("google", googleProfile(email, undefined, false));
      const res = await callback("google", tenantState());
      expect(location(res)).not.toContain("/u/auth/callback?ct=");
      expect((await loginUser(t, fx, email, STRONG_PASSWORD)).res.status).toBe(401);
      const rows = await t.db.query(`SELECT 1 FROM "fk_${fx.slug.replace(/-/g, "_")}".users WHERE email = $1`, [email]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("callback: existing link", () => {
    it("a second login with the same provider identity reuses the same user", async () => {
      const email = uniqueEmail("grepeat");
      const profile = googleProfile(email, "g-fixed-" + Date.now());
      stubProvider("google", profile);
      const first = await callback("google", tenantState());
      const second = await callback("google", tenantState());
      expect(location(first)).toContain("ct=");
      expect(location(second)).toContain("ct=");
      const rows = await t.db.query(`SELECT count(*)::int AS n FROM "fk_${fx.slug.replace(/-/g, "_")}".users WHERE email = $1`, [email]);
      expect(rows[0].n).toBe(1);
    });

    it("the same provider identity in another tenant is a different account", async () => {
      const other = await createTenant(t);
      const email = uniqueEmail("gmulti");
      const profile = googleProfile(email, "g-multi-" + Date.now());
      stubProvider("google", profile);
      await callback("google", tenantState());
      const res = await callback("google", { tenantId: other.tenantId });
      expect(location(res)).toContain("ct=");
      const ct = new URL(location(res)).searchParams.get("ct")!;
      const claim = await t.http({ tenant: other.slug }).post("/auth/social/claim-session").send({ ct });
      const me = await as(t, other.slug, cookieValue(cookiesOf(claim), "accessToken")).get("/users/me");
      expect(me.body.data.tenantId).toBe(other.tenantId);
    });

    it("a deactivated user cannot sign in with a linked social identity", async () => {
      const email = uniqueEmail("gdead");
      stubProvider("google", googleProfile(email, "g-dead-" + Date.now()));
      const first = await callback("google", tenantState());
      const ct = new URL(location(first)).searchParams.get("ct")!;
      const claim = await t.http({ tenant: fx.slug }).post("/auth/social/claim-session").send({ ct });
      const me = await as(t, fx.slug, cookieValue(cookiesOf(claim), "accessToken")).get("/users/me");
      await as(t, fx.slug, fx.admin.accessToken).post("/users/bulk/update-status").send({ userIds: [me.body.data.id], isActive: false });
      const again = await callback("google", tenantState());
      expect(location(again)).not.toContain("/u/auth/callback?ct=");
    });
  });

  describe("callback: existing email -> link request flow", () => {
    it("never auto-links; mails the mailbox owner; confirming links; the token is single use", async () => {
      const local = await registerAndVerifyUser(t, fx);
      const gid = "g-link-" + Date.now();
      stubProvider("google", googleProfile(local.email, gid));
      t.mail.clear();
      const res = await callback("google", tenantState());
      expect(location(res)).toContain(`${PORTAL}/u/link-required`);
      expect(location(res)).not.toContain("ct=");
      const mail = t.mail.last(local.email, "social-account-link-request");
      expect(mail).toBeDefined();
      const token = tokenFromLink(extractLink(mail!, "/u/link/confirm"));

      // Before confirmation the social identity does not log in.
      const before = await callback("google", tenantState());
      expect(location(before)).not.toContain("ct=");

      const confirm = await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${token}`);
      expect(confirm.status).toBe(302);
      expect(location(confirm)).toContain("link-success");
      const again = await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${token}`);
      expect(location(again)).toContain("/error");

      const after = await callback("google", tenantState());
      expect(location(after)).toContain("ct=");
      expect((await loginUser(t, fx, local.email, local.password)).res.status).toBe(200);
    });

    it("an unverified provider email for an existing user is refused and no mail is sent", async () => {
      const local = await registerAndVerifyUser(t, fx);
      stubProvider("github", { id: "gh-" + Date.now(), displayName: "Evil", emails: [{ value: local.email, verified: false, primary: true }] });
      t.mail.clear();
      const res = await callback("github", tenantState());
      expect(location(res)).toContain("/u/login?error=");
      expect(t.mail.last(local.email, "social-account-link-request")).toBeUndefined();
    });

    it("confirming a link reclaims a never-verified local account and drops its password", async () => {
      const email = uniqueEmail("preg");
      const reg = await t.http({ tenant: fx.slug }).post("/auth/register").send({ email, password: STRONG_PASSWORD, firstName: "Pre" });
      expect(reg.status).toBe(201);
      stubProvider("google", googleProfile(email, "g-pre-" + Date.now()));
      t.mail.clear();
      await callback("google", tenantState());
      const token = tokenFromLink(extractLink(t.mail.last(email, "social-account-link-request")!, "/u/link/confirm"));
      expect((await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${token}`)).status).toBe(302);
      expect((await loginUser(t, fx, email, STRONG_PASSWORD)).res.status).toBe(401);
    });

    it("an expired or unknown link token is refused", async () => {
      const local = await registerAndVerifyUser(t, fx);
      stubProvider("google", googleProfile(local.email, "g-exp-" + Date.now()));
      t.mail.clear();
      await callback("google", tenantState());
      const token = tokenFromLink(extractLink(t.mail.last(local.email, "social-account-link-request")!, "/u/link/confirm"));
      await t.db.query(`UPDATE "fk_${fx.slug.replace(/-/g, "_")}".social_link_requests SET expires_at = now() - interval '1 hour' WHERE token = $1`, [token]);
      expect(location(await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${token}`))).toContain("/error");
      expect(location(await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${"0".repeat(64)}`))).toContain("/error");
    });
  });

  describe("callback hardening", () => {
    it("never redirects to a foreign origin (including prefix look-alikes)", async () => {
      for (const returnUrl of ["https://evil.example.com", "http://localhost:3000.evil.example.com/x", "//evil.example.com", "javascript:alert(1)"]) {
        stubProvider("google", googleProfile(uniqueEmail("redir")));
        const res = await callback("google", { returnUrl });
        const loc = location(res);
        expect(loc.startsWith(`${PORTAL}/`)).toBe(true);
        expect(loc).not.toContain("evil.example.com");
      }
    });

    it("malformed state and missing tenant are redirected to an error page", async () => {
      stubProvider("google", googleProfile(uniqueEmail("badstate")));
      expect(location(await callback("google", "not-base64-json"))).toContain("/error");
      expect(location(await callback("google", stateOf({ returnUrl: PORTAL })))).toContain("/error");
    });

    it("a provider failure never creates a session", async () => {
      stubProvider("google", new Error("provider down"));
      const res = await callback("google", tenantState());
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(cookiesOf(res).some((c) => c.startsWith("refreshToken="))).toBe(false);
    });

    it("the callback without a code is not a login", async () => {
      const b = await begin("google");
      const res = await t.http({ tenant: fx.slug, cookies: b.cookies }).get(`/auth/social/google/callback?state=${encodeURIComponent(b.state)}`);
      expect(location(res)).not.toContain("ct=");
    });

    it("an unknown tenant id in state cannot mint users", async () => {
      stubProvider("google", googleProfile(uniqueEmail("ghosttenant")));
      const res = await callback("google", { tenantId: "00000000-0000-4000-8000-000000000000" });
      expect(location(res)).not.toContain("ct=");
    });
  });

  describe("claim-session", () => {
    it("rejects garbage, an access token, and a tampered completion token", async () => {
      for (const ct of ["garbage", member.accessToken, ""]) {
        const res = await t.http({ tenant: fx.slug }).post("/auth/social/claim-session").send({ ct });
        expect([400, 401, 422]).toContain(res.status);
        expect(cookieValue(cookiesOf(res), "accessToken")).toBe("");
      }
      stubProvider("google", googleProfile(uniqueEmail("ct")));
      const ctGood = new URL(location(await callback("google", tenantState()))).searchParams.get("ct")!;
      const [h, p, s] = ctGood.split(".");
      const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), accessToken: member.accessToken })).toString("base64url")}.${s}`;
      expect((await t.http({ tenant: fx.slug }).post("/auth/social/claim-session").send({ ct: tampered })).status).toBe(401);
    });
  });

  describe("authenticated linking", () => {
    it("link/token requires auth; link/<provider> rejects a bad token", async () => {
      expect((await t.http({ tenant: fx.slug }).post("/auth/social/link/token")).status).toBe(401);
      for (const p of ["google", "github", "microsoft"]) {
        expect((await t.http({ tenant: fx.slug }).get(`/auth/social/link/${p}?lt=bad`)).status).toBe(401);
      }
    });

    it("link flow: token -> provider redirect -> callback links to that user only", async () => {
      const u = await addMember(t, fx, "member");
      const lt = (await as(t, fx.slug, u.accessToken).post("/auth/social/link/token")).body.data.data.linkToken as string;
      const redirect = await t.http({ tenant: fx.slug }).get(`/auth/social/link/google?lt=${lt}`);
      expect(redirect.status).toBe(302);
      stubProvider("google", googleProfile(u.email, "g-auth-link-" + Date.now()));
      const cb = await finish("google", { state: stateOfLocation(redirect), cookies: cookiesOf(redirect) });
      expect(location(cb)).toContain("mode=link&provider=google");
      const conns = await as(t, fx.slug, u.accessToken).get("/auth/social/connections");
      expect(conns.body.data.map((c: { provider: string }) => c.provider)).toEqual(["google"]);
      expect(JSON.stringify(conns.body)).not.toMatch(/accessToken|refreshToken|access_token/);
    });

    it("a forged link state (no signed link token) cannot attach an identity to someone else's account", async () => {
      const victim = await addMember(t, fx, "member");
      const pid = "g-attacker-" + Date.now();
      stubProvider("google", googleProfile(uniqueEmail("attacker"), pid));
      const forged = { mode: "link", userId: victim.id, tenantId: fx.tenantId };
      // Unsigned state, even with a valid browser nonce cookie.
      await callback("google", stateOf(forged));
      const conns = await as(t, fx.slug, victim.accessToken).get("/auth/social/connections");
      expect(conns.body.data).toHaveLength(0);
      // ... nor with a link token minted for a different user.
      const other = await addMember(t, fx, "member");
      const lt = (await as(t, fx.slug, other.accessToken).post("/auth/social/link/token")).body.data.data.linkToken as string;
      await callback("google", stateOf({ ...forged, lt }));
      expect((await as(t, fx.slug, victim.accessToken).get("/auth/social/connections")).body.data).toHaveLength(0);
    });
  });

  describe("connections", () => {
    async function socialOnlyUser(): Promise<string> {
      const email = uniqueEmail("sonly");
      stubProvider("google", googleProfile(email, "g-only-" + Date.now()));
      const ct = new URL(location(await callback("google", tenantState()))).searchParams.get("ct")!;
      const claim = await t.http({ tenant: fx.slug }).post("/auth/social/claim-session").send({ ct });
      return cookieValue(cookiesOf(claim), "accessToken");
    }

    it("lists connections without token material", async () => {
      const token = await socialOnlyUser();
      const res = await as(t, fx.slug, token).get("/auth/social/connections");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toMatch(/provider-access-token|provider-refresh-token|accessToken/);
      expect((await t.http({ tenant: fx.slug }).get("/auth/social/connections")).status).toBe(401);
    });

    it("refuses to unlink the last sign-in method, allows it once a password exists", async () => {
      const token = await socialOnlyUser();
      const c = () => as(t, fx.slug, token);
      const refused = await c().delete("/auth/social/connections/google");
      expect(refused.status).toBe(409);
      const still = await c().get("/auth/social/connections");
      expect({ s: still.status, c: still.body.code }).toEqual({ s: 200, c: undefined });
      expect(still.body.data).toHaveLength(1);

      const withPw = await registerAndVerifyUser(t, fx);
      stubProvider("google", googleProfile(withPw.email, "g-pw-" + Date.now()));
      t.mail.clear();
      await callback("google", tenantState());
      await t.http({ tenant: fx.slug }).get(`/auth/social/link/confirm?token=${tokenFromLink(extractLink(t.mail.last(withPw.email, "social-account-link-request")!, "/u/link/confirm"))}`);
      const login = await loginUser(t, fx, withPw.email, withPw.password);
      const own = as(t, fx.slug, login.accessToken);
      expect((await own.get("/auth/social/connections")).body.data).toHaveLength(1);
      expect((await own.delete("/auth/social/connections/google")).status).toBe(200);
      expect((await own.delete("/auth/social/connections/google")).status).toBe(404);
      expect((await auditItems(t, fx)).map((i) => i.eventType)).toContain("social.account_unlinked");
    });

    it("cannot unlink another user's connection", async () => {
      const a = await socialOnlyUser();
      const b = await addMember(t, fx, "member");
      expect((await as(t, fx.slug, b.accessToken).delete("/auth/social/connections/google")).status).toBe(404);
      expect((await as(t, fx.slug, a).get("/auth/social/connections")).body.data).toHaveLength(1);
      void adminUserId;
    });
  });
});

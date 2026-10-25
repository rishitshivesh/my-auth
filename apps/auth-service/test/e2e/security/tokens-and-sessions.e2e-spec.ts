import { createHmac, randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import {
  createTenant,
  createTestApp,
  cookieValue,
  cookiesOf,
  mergeCookies,
  type TenantFixture,
  type TestApp,
} from "../support";

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("security: JWT, sessions, purpose-bound tokens", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;

  const signRs256 = async (tenantId: string, payload: Record<string, unknown>, expiresIn = "5m"): Promise<string> => {
    const jwks = t.app.get(JwksService, { strict: false });
    const jwt = t.app.get(JwtService, { strict: false });
    const { kid, privateKey } = await jwks.getCurrentSigningKey(tenantId);
    return jwt.sign(payload, {
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      algorithm: "RS256",
      header: { alg: "RS256", kid },
      expiresIn: expiresIn as never,
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
  });
  afterAll(() => t.close());

  const me = (slug: string, bearer?: string, cookies?: string[]) =>
    t.http({ tenant: slug, bearer, cookies }).get("/auth/me");

  it("accepts a genuine access token (control)", async () => {
    expect((await me(a.slug, a.admin.accessToken)).status).toBe(200);
  });

  it("rejects alg=none tokens", async () => {
    const forged = `${b64({ alg: "none", typ: "JWT", kid: "x" })}.${b64({ sub: randomUUID(), tenantId: a.tenantId })}.`;
    expect((await me(a.slug, forged)).status).toBe(401);
  });

  it("rejects HS256 tokens signed with a guessable secret / the public key id", async () => {
    const head = b64({ alg: "HS256", typ: "JWT", kid: "anything" });
    const body = b64({ sub: randomUUID(), tenantId: a.tenantId, sessionId: randomUUID() });
    const sig = createHmac("sha256", "secret").update(`${head}.${body}`).digest("base64url");
    expect((await me(a.slug, `${head}.${body}.${sig}`)).status).toBe(401);
  });

  it("rejects a token with a tampered payload", async () => {
    const [h, , s] = a.admin.accessToken.split(".");
    const evil = b64({ sub: randomUUID(), tenantId: a.tenantId, sessionId: randomUUID(), groups: ["admin"] });
    expect((await me(a.slug, `${h}.${evil}.${s}`)).status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const tok = await signRs256(a.tenantId, { sub: randomUUID(), tenantId: a.tenantId, sessionId: randomUUID() }, "-10s");
    expect((await me(a.slug, tok)).status).toBe(401);
  });

  it("rejects a tenant A token presented to tenant B", async () => {
    const res = await me(b.slug, a.admin.accessToken);
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a validly signed token whose session does not exist", async () => {
    const tok = await signRs256(a.tenantId, { sub: randomUUID(), tenantId: a.tenantId, sessionId: randomUUID() }, "5m");
    const res = await me(a.slug, tok);
    expect([401, 403]).toContain(res.status);
  });

  describe("purpose-bound tokens are not access tokens (MFA bypass regression)", () => {
    it.each(["/mfa/status", "/webhooks", "/ldap/connections", "/rbac/roles"])(
      "mfa_pending token is refused on %s",
      async (path) => {
        const userId = randomUUID();
        const pending = await signRs256(a.tenantId, {
          sub: userId,
          email: "x@e2e.example.com",
          tenantId: a.tenantId,
          type: "mfa_pending",
          jti: randomUUID(),
        });
        const res = await t.http({ tenant: a.slug, bearer: pending }).get(path);
        expect(res.status).toBe(401);
      },
    );

    it("mfa_pending token cannot disable MFA", async () => {
      const pending = await signRs256(a.tenantId, { sub: randomUUID(), tenantId: a.tenantId, type: "mfa_pending" });
      expect((await t.http({ tenant: a.slug, bearer: pending }).delete("/mfa/all")).status).toBe(401);
    });

    it("mfa_pending cookie does not establish a SAML SSO identity", async () => {
      const pending = await signRs256(a.tenantId, { sub: randomUUID(), tenantId: a.tenantId, type: "mfa_pending" });
      const res = await t
        .http({ cookies: [`accessToken=${pending}`] })
        .post(`/saml/sso/${a.slug}`)
        .type("form")
        .send({ SAMLRequest: "AAAA" });
      // Never an assertion form, whatever the unauthenticated path does (redirect to login or 4xx).
      expect(res.status).not.toBe(200);
      expect(res.text).not.toContain("SAMLResponse");
    });
  });

  describe("logout invalidates the session on every guarded surface", () => {
    it("revoked session is refused on routes that previously skipped SessionGuard", async () => {
      const fx = await createTenant(t);
      expect((await t.http({ tenant: fx.slug, bearer: fx.admin.accessToken }).get("/webhooks")).status).toBe(200);
      const out = await t.http({ tenant: fx.slug, cookies: fx.admin.cookies }).post("/auth/logout");
      expect(out.status).toBe(200);
      for (const path of ["/auth/me", "/webhooks", "/mfa/status", "/ldap/connections"]) {
        const res = await t.http({ tenant: fx.slug, bearer: fx.admin.accessToken }).get(path);
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe("refresh rotation", () => {
    it("reusing a rotated refresh token is refused and revokes the family", async () => {
      const fx = await createTenant(t);
      const rt1 = cookieValue(fx.admin.cookies, "refreshToken");
      expect(rt1).not.toBe("");
      const first = await t.http({ tenant: fx.slug, cookies: [`refreshToken=${rt1}`] }).post("/auth/refresh");
      expect(first.status).toBe(200);
      const rt2 = cookieValue(cookiesOf(first), "refreshToken");
      expect(rt2).not.toBe(rt1);

      const replay = await t.http({ tenant: fx.slug, cookies: [`refreshToken=${rt1}`] }).post("/auth/refresh");
      expect(replay.status).toBe(401);
      const afterReuse = await t.http({ tenant: fx.slug, cookies: [`refreshToken=${rt2}`] }).post("/auth/refresh");
      expect(afterReuse.status).toBe(401);
    });
  });

  describe("cookie flags", () => {
    it("auth cookies are HttpOnly + SameSite=Strict", async () => {
      const fx = await createTenant(t);
      const cookies = mergeCookies([], fx.admin.cookies);
      for (const name of ["accessToken", "refreshToken"]) {
        const raw = cookies.find((c) => c.startsWith(`${name}=`)) ?? "";
        expect(raw).toMatch(/HttpOnly/i);
        expect(raw).toMatch(/SameSite=Strict/i);
      }
    });
  });
});

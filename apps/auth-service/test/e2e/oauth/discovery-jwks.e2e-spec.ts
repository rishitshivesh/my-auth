import { createVerify, createPublicKey } from "node:crypto";
import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";
import { OAuthTokenService } from "@/modules/oauth/services/oauth-token.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { createClient, basic, decodeJwt } from "./oauth-util";

describe("OIDC discovery and JWKS", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
  });
  afterAll(() => t.close());

  it("serves /.well-known/openid-configuration unwrapped with consistent endpoints", async () => {
    const res = await t.http().get("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(res.body.status).toBeUndefined();
    expect(res.body.issuer).toEqual(expect.any(String));
    expect(res.body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(res.body.id_token_signing_alg_values_supported).toEqual(["RS256"]);
    expect(res.body.response_types_supported).toEqual(["code"]);
    for (const k of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri", "revocation_endpoint", "introspection_endpoint"]) {
      expect(res.body[k]).toMatch(/^https?:\/\//);
    }
    expect(res.headers["cache-control"]).toMatch(/max-age/);
  });

  it("tenant-scoped discovery route is also RFC-shaped (not enveloped)", async () => {
    const res = await t.http({ tenant: a.slug }).get("/oauth/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(res.body.issuer).toEqual(expect.any(String));
  });

  it("publishes an RS256 JWK set with kid, no private members", async () => {
    const res = await t.http().get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.body.keys.length).toBeGreaterThan(0);
    for (const k of res.body.keys) {
      expect(k).toMatchObject({ kty: "RSA", use: "sig", alg: "RS256" });
      expect(k.kid).toEqual(expect.any(String));
      for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) expect(k[priv]).toBeUndefined();
    }
  });

  it("tenant JWKS includes that tenant's key and not another tenant's", async () => {
    const ra = await t.http({ tenant: a.slug }).get("/oauth/jwks");
    const rb = await t.http({ tenant: b.slug }).get("/oauth/jwks");
    expect(ra.status).toBe(200);
    const kidsA: string[] = ra.body.keys.map((k: { kid: string }) => k.kid);
    const kidsB: string[] = rb.body.keys.map((k: { kid: string }) => k.kid);
    const own = await t.db.query(`SELECT kid, tenant_id FROM key_pairs WHERE tenant_id IN ($1,$2) AND status='active'`, [a.tenantId, b.tenantId]);
    const kidA = own.find((r: { tenant_id: string }) => r.tenant_id === a.tenantId)?.kid;
    const kidB = own.find((r: { tenant_id: string }) => r.tenant_id === b.tenantId)?.kid;
    expect(kidA).toBeTruthy();
    expect(kidB).toBeTruthy();
    expect(kidsA).toContain(kidA);
    expect(kidsA).not.toContain(kidB);
    expect(kidsB).toContain(kidB);
    expect(kidsB).not.toContain(kidA);
  });

  it("issued tokens carry a kid and verify with the published key (RS256)", async () => {
    const c = await createClient(t, a);
    const tok = await t.http({ tenant: a.slug }).post("/oauth/token").set("authorization", basic(c.clientId, c.clientSecret!)).type("form").send({ grant_type: "client_credentials", scope: "read" });
    expect(tok.status).toBe(200);
    const jwt = tok.body.access_token as string;
    const { header, payload } = decodeJwt(jwt);
    expect(header.alg).toBe("RS256");
    const jwks = await t.http({ tenant: a.slug }).get("/oauth/jwks");
    const jwk = jwks.body.keys.find((k: { kid: string }) => k.kid === header.kid);
    expect(jwk).toBeTruthy();
    const [h, p, s] = jwt.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
    expect(payload.iss).toBe((await t.http().get("/.well-known/openid-configuration")).body.issuer);
  });

  it("key rotation: old token keeps verifying via retired key, new tokens use a new kid", async () => {
    const c = await createClient(t, b);
    const issue = async () => {
      const r = await t.http({ tenant: b.slug }).post("/oauth/token").set("authorization", basic(c.clientId, c.clientSecret!)).type("form").send({ grant_type: "client_credentials", scope: "read" });
      return r.body.access_token as string;
    };
    const before = await issue();
    const jwksSvc = (t.app.get(OAuthTokenService) as unknown as { jwksService: JwksService }).jwksService;
    await jwksSvc.rotateKey(b.tenantId);
    const after = await issue();
    const kb = decodeJwt(before).header.kid;
    const ka = decodeJwt(after).header.kid;
    expect(ka).not.toBe(kb);
    const jwks = await t.http({ tenant: b.slug }).get("/oauth/jwks");
    const kids = jwks.body.keys.map((k: { kid: string }) => k.kid);
    expect(kids).toEqual(expect.arrayContaining([kb, ka]));
    // Both tokens introspect active
    const intro = (tok: string) => t.http({ tenant: b.slug }).post("/oauth/introspect").set("authorization", basic(c.clientId, c.clientSecret!)).type("form").send({ token: tok });
    expect((await intro(before)).body.active).toBe(true);
    expect((await intro(after)).body.active).toBe(true);
    // Revoked (grace elapsed) key stops verifying
    await t.db.query(`UPDATE key_pairs SET status='revoked' WHERE kid=$1`, [kb]);
    expect((await intro(before)).body.active).toBe(false);
    const jwks2 = await t.http({ tenant: b.slug }).get("/oauth/jwks");
    expect(jwks2.body.keys.map((k: { kid: string }) => k.kid)).not.toContain(kb);
  });
});

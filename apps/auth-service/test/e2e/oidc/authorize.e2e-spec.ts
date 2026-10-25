import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";
import { createClient, pkcePair, REDIRECT, type ClientFixture } from "../oauth/oauth-util";

/** Drives GET /oauth/authorize over HTTP with the admin's session cookies (hosted-login flow). */
describe("OIDC authorization endpoint logic", () => {
  let t: TestApp;
  let a: TenantFixture;
  let confidential: ClientFixture;
  let publicClient: ClientFixture;

  interface Outcome {
    redirect?: string;
    error?: { status: number; body: Record<string, unknown> };
  }

  const authorize = async (query: Record<string, string>): Promise<Outcome> => {
    const res = await t.http({ tenant: a.slug, cookies: a.admin.cookies }).get("/oauth/authorize").query(query);
    if (res.status === 302) return { redirect: res.headers["location"] as string };
    return { error: { status: res.status, body: res.body as Record<string, unknown> } };
  };

  /** First-party clients skip the consent screen (covered by the hosted-login spec). */
  const markFirstParty = (client: ClientFixture): Promise<unknown> =>
    t.db.query(
      `UPDATE "fk_${a.slug.replace(/-/g, "_")}".oauth_clients SET is_first_party = true, require_consent = false WHERE id = $1`,
      [client.id],
    );

  const base = (client: ClientFixture, extra: Record<string, string> = {}): Record<string, string> => ({
    client_id: client.clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid",
    ...extra,
  });

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    confidential = await createClient(t, a);
    publicClient = await createClient(t, a, { clientType: "public", grantTypes: ["authorization_code", "refresh_token"] });
    await markFirstParty(confidential);
    await markFirstParty(publicClient);
  });
  afterAll(() => t.close());

  it("issues a code and echoes state on the exact redirect_uri", async () => {
    const { challenge } = pkcePair();
    const out = await authorize(base(publicClient, { state: "st-123", code_challenge: challenge, code_challenge_method: "S256" }));
    expect(out.redirect).toBeDefined();
    const u = new URL(out.redirect!);
    expect(`${u.origin}${u.pathname}`).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("st-123");
    expect(u.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("omits state when none was sent", async () => {
    const out = await authorize(base(confidential));
    expect(new URL(out.redirect!).searchParams.has("state")).toBe(false);
  });

  it.each([
    ["prefix match", `${REDIRECT}/extra`],
    ["query appended", `${REDIRECT}?next=https://evil.example.com`],
    ["trailing slash", `${REDIRECT}/`],
    ["different host", "https://evil.example.com/callback"],
    ["userinfo trick", "https://app.example.com@evil.example.com/callback"],
    ["userinfo trick 2", "https://evil.example.com\\@app.example.com/callback"],
    ["subdomain", "https://x.app.example.com/callback"],
    ["http downgrade", "http://app.example.com/callback"],
    ["uppercase host", "https://APP.example.com/callback"],
    ["fragment", `${REDIRECT}#frag`],
    ["wildcard literal", "https://*.example.com/callback"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects redirect_uri that is not an exact registered match (%s)", async (_n, uri) => {
    const out = await authorize(base(confidential, { redirect_uri: uri }));
    expect(out.redirect).toBeUndefined();
    expect(out.error?.status).toBe(400);
    expect(out.error?.body.error).toBe("invalid_request");
  });

  it("rejects unknown clients without redirecting", async () => {
    const out = await authorize({ ...base(confidential), client_id: "client_nope" });
    expect(out.redirect).toBeUndefined();
    expect(out.error?.body.error).toBe("invalid_request");
  });

  it("requires PKCE for public clients and only accepts S256", async () => {
    const noPkce = await authorize(base(publicClient));
    expect(noPkce.error?.body.error).toBe("invalid_request");
    const { verifier } = pkcePair();
    const plain = await authorize(base(publicClient, { code_challenge: verifier, code_challenge_method: "plain" }));
    expect(plain.error?.body.error).toBe("invalid_request");
    const noMethod = await authorize(base(publicClient, { code_challenge: verifier }));
    expect(noMethod.error?.body.error).toBe("invalid_request");
  });

  it("rejects a confidential client's plain challenge too", async () => {
    const out = await authorize(base(confidential, { code_challenge: pkcePair().verifier, code_challenge_method: "plain" }));
    expect(out.error?.body.error).toBe("invalid_request");
  });

  it("refuses a client that lacks the authorization_code grant", async () => {
    const m2m = await createClient(t, a, { grantTypes: ["client_credentials"], redirectUris: [REDIRECT] });
    await markFirstParty(m2m);
    const out = await authorize(base(m2m));
    expect(out.error?.body.error).toBe("unauthorized_client");
  });

  it("does not grant scopes beyond the client's allow-list", async () => {
    const out = await authorize(base(confidential, { scope: "openid admin:all" }));
    expect(out.redirect).toBeDefined();
    const rows = await t.db.query(
      `SELECT scope FROM "fk_${a.slug.replace(/-/g, "_")}".oauth_authorization_codes WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [confidential.id],
    );
    expect(rows[0].scope).not.toMatch(/admin:all/);
  });

  it("stores the nonce with the code so it reaches the id_token", async () => {
    await authorize(base(confidential, { nonce: "nonce-abc-123" }));
    const rows = await t.db.query(
      `SELECT nonce FROM "fk_${a.slug.replace(/-/g, "_")}".oauth_authorization_codes WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [confidential.id],
    );
    expect(rows[0].nonce).toBe("nonce-abc-123");
  });

  it("registering clients rejects wildcard, http (non-localhost) and malformed redirect URIs", async () => {
    const reg = (uris: string[]) =>
      t.http({ tenant: a.slug, bearer: a.admin.accessToken }).post("/oauth/clients").send({
        name: "bad", clientType: "public", grantTypes: ["authorization_code"], redirectUris: uris,
      });
    expect((await reg(["http://app.example.com/cb"])).status).toBeGreaterThanOrEqual(400);
    expect((await reg(["https://*.example.com/cb"])).status).toBeGreaterThanOrEqual(400);
    expect((await reg(["not a url"])).status).toBeGreaterThanOrEqual(400);
    expect((await reg([])).status).toBeGreaterThanOrEqual(400);
  });
});

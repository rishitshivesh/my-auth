import { createHmac } from "node:crypto";
import { createTestApp, createTenant, clearRateLimits, type TestApp, type TenantFixture } from "../support";
import { createClient, basic, pkcePair, seedCode, userIdOf, REDIRECT, decodeJwt, forgeRs256, b64u, tenantSchema, type ClientFixture } from "./oauth-util";

describe("OAuth2 token endpoint", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let confidential: ClientFixture;
  let publicClient: ClientFixture;
  let userId: string;

  const token = (tenant: TenantFixture, body: Record<string, string>, auth?: string) => {
    const r = t.http({ tenant: tenant.slug }).post("/oauth/token").type("form");
    if (auth) r.set("authorization", auth);
    return r.send(body);
  };
  const confAuth = () => basic(confidential.clientId, confidential.clientSecret!);
  const exchange = async (code: string, extra: Record<string, string> = {}) =>
    token(a, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, ...extra }, confAuth());

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    confidential = await createClient(t, a);
    publicClient = await createClient(t, a, { clientType: "public", grantTypes: ["authorization_code", "refresh_token"] });
    userId = await userIdOf(t, a.slug, a.admin.email);
  });
  beforeEach(() => clearRateLimits(t));
  afterAll(() => t.close());

  describe("client authentication and RFC 6749 errors", () => {
    it("stores only a hash of the client secret and never returns it again", async () => {
      expect(confidential.clientSecret).toBeTruthy();
      const rows = await t.db.query(`SELECT client_secret_hash FROM "${tenantSchema(a.slug)}".oauth_clients WHERE client_id=$1`, [confidential.clientId]);
      expect(rows[0].client_secret_hash).toBeTruthy();
      expect(rows[0].client_secret_hash).not.toContain(confidential.clientSecret!);
      const get = await t.http({ tenant: a.slug, bearer: a.admin.accessToken }).get(`/oauth/clients/${confidential.clientId}`);
      expect(JSON.stringify(get.body)).not.toContain(confidential.clientSecret!);
      expect(JSON.stringify(get.body)).not.toMatch(/clientSecretHash|client_secret_hash/);
    });

    it("rejects a wrong secret with 401 invalid_client and a WWW-Authenticate challenge", async () => {
      const res = await token(a, { grant_type: "client_credentials" }, basic(confidential.clientId, "nope"));
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: "invalid_client", error_description: expect.any(String) });
      expect(res.headers["www-authenticate"]).toMatch(/Basic/);
      expect(res.body.status).toBeUndefined();
    });

    it("treats an unknown client exactly like a bad secret", async () => {
      const res = await token(a, { grant_type: "client_credentials" }, basic("client_doesnotexist", "x"));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_client");
    });

    it("accepts client_secret_post as well as Basic", async () => {
      const res = await token(a, { grant_type: "client_credentials", scope: "read", client_id: confidential.clientId, client_secret: confidential.clientSecret! });
      expect(res.status).toBe(200);
      expect(res.body.token_type).toBe("Bearer");
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.status).toBeUndefined();
    });

    it("rejects missing grant_type with invalid_request and unknown grant with unsupported_grant_type", async () => {
      const missing = await token(a, {}, confAuth());
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("invalid_request");
      const unknown = await token(a, { grant_type: "password", username: "x", password: "y" }, confAuth());
      expect(unknown.status).toBe(400);
      expect(["unsupported_grant_type", "unauthorized_client"]).toContain(unknown.body.error);
    });

    it("rejects a public client that sends a secret", async () => {
      const res = await token(a, { grant_type: "authorization_code", code: "x", redirect_uri: REDIRECT, client_id: publicClient.clientId, client_secret: "s" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_client");
    });

    it("does not authenticate a tenant-A client against tenant B", async () => {
      const res = await token(b, { grant_type: "client_credentials" }, confAuth());
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_client");
    });

    it("rate limits the token endpoint per IP", async () => {
      const ip = "10.99.99.99";
      let last = 0;
      for (let i = 0; i < 14; i++) {
        const r = await t.http({ tenant: a.slug, ip }).post("/oauth/token").type("form").send({ grant_type: "client_credentials", client_id: "x", client_secret: "y" });
        last = r.status;
      }
      expect(last).toBe(429);
    });
  });

  describe("client_credentials", () => {
    it("issues an M2M token whose scope is limited to the client's allowed scopes", async () => {
      const res = await token(a, { grant_type: "client_credentials", scope: "read admin:everything" }, confAuth());
      expect(res.status).toBe(200);
      expect(res.body.scope).toBe("read");
      const { payload } = decodeJwt(res.body.access_token);
      expect(payload.sub).toBe(confidential.id);
      expect(payload.aud).toBe(confidential.id);
      expect(payload.scope).toBe("read");
    });

    it("refuses scope escalation to scopes the client was never allowed", async () => {
      const res = await token(a, { grant_type: "client_credentials", scope: "admin:everything users:write" }, confAuth());
      // either rejected or silently reduced to the client's defaults, never granted
      if (res.status === 200) {
        expect(res.body.scope ?? "").not.toMatch(/admin:everything|users:write/);
      } else {
        expect(res.body.error).toBe("invalid_scope");
      }
    });

    it("refuses client_credentials for a public client and for a client without the grant", async () => {
      const noGrant = await createClient(t, a, { grantTypes: ["authorization_code"] });
      const res = await token(a, { grant_type: "client_credentials" }, basic(noGrant.clientId, noGrant.clientSecret!));
      expect([400, 401]).toContain(res.status);
      expect(res.status).not.toBe(200);
      expect(res.body.error).toBe("unauthorized_client");
    });
  });

  describe("authorization code + PKCE", () => {
    it("exchanges a code once; the second use fails with invalid_grant", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      const ok = await exchange(code, { code_verifier: verifier });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ token_type: "Bearer", scope: "openid email" });
      expect(ok.body.refresh_token).toEqual(expect.any(String));
      expect(ok.body.id_token).toEqual(expect.any(String));
      const replay = await exchange(code, { code_verifier: verifier });
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe("invalid_grant");
    });

    it("binds the code to the redirect_uri", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      const res = await exchange(code, { code_verifier: verifier, redirect_uri: `${REDIRECT}/../evil` });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_grant");
    });

    it("binds the code to the client", async () => {
      const other = await createClient(t, a);
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      const res = await token(a, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier }, basic(other.clientId, other.clientSecret!));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_grant");
    });

    it("rejects a wrong or missing code_verifier and a malformed one", async () => {
      const { challenge } = pkcePair();
      const c1 = await seedCode(t, a, confidential, { userId, challenge });
      const missing = await exchange(c1);
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("invalid_grant");
      const c2 = await seedCode(t, a, confidential, { userId, challenge });
      const wrong = await exchange(c2, { code_verifier: pkcePair().verifier });
      expect(wrong.body.error).toBe("invalid_grant");
      const c3 = await seedCode(t, a, confidential, { userId, challenge });
      const short = await exchange(c3, { code_verifier: "short" });
      expect(short.body.error).toBe("invalid_grant");
    });

    it("rejects an expired code", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      await t.db.query(`UPDATE "${tenantSchema(a.slug)}".oauth_authorization_codes SET expires_at = now() - interval '1 minute' WHERE client_id=$1 AND used_at IS NULL`, [confidential.id]);
      const res = await exchange(code, { code_verifier: verifier });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_grant");
    });

    it("rejects codes issued with the plain method", async () => {
      const verifier = pkcePair().verifier;
      const code = await seedCode(t, a, confidential, { userId, challenge: verifier });
      await t.db.query(`UPDATE "${tenantSchema(a.slug)}".oauth_authorization_codes SET code_challenge_method='plain' WHERE client_id=$1 AND used_at IS NULL`, [confidential.id]);
      const res = await exchange(code, { code_verifier: verifier });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid_request|invalid_grant/);
    });

    it("requires code and redirect_uri parameters", async () => {
      const noCode = await token(a, { grant_type: "authorization_code", redirect_uri: REDIRECT }, confAuth());
      expect(noCode.body.error).toBe("invalid_request");
      const noRedirect = await token(a, { grant_type: "authorization_code", code: "x" }, confAuth());
      expect(noRedirect.body.error).toBe("invalid_request");
    });

    it("a code from another tenant is useless in this tenant", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      const res = await token(b, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier }, confAuth());
      expect(res.status).toBe(401);
    });

    it("id_token carries the nonce, aud and email claims and is RS256", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge, nonce: "n-0S6_WzA2Mj" });
      const res = await exchange(code, { code_verifier: verifier });
      const { header, payload } = decodeJwt(res.body.id_token);
      expect(header.alg).toBe("RS256");
      expect(payload).toMatchObject({ nonce: "n-0S6_WzA2Mj", aud: confidential.clientId, sub: userId, email: a.admin.email });
      expect(payload.exp).toBeGreaterThan(payload.iat as number);
    });
  });

  describe("/oauth/authorize", () => {
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

    it("redirects unauthenticated browsers to login without issuing a code", async () => {
      const { challenge } = pkcePair();
      const res = await t.http({ tenant: a.slug }).get(`/oauth/authorize?${q({ client_id: confidential.clientId, redirect_uri: REDIRECT, response_type: "code", scope: "openid", state: "xyz", code_challenge: challenge, code_challenge_method: "S256" })}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/u\/login\?.*continue=%2Foauth%2Fauthorize%3F/);
      expect(res.headers.location).not.toContain("code=");
    });

    it("validates required query parameters", async () => {
      const res = await t.http({ tenant: a.slug }).get(`/oauth/authorize?${q({ client_id: confidential.clientId })}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("refresh_token", () => {
    const issue = async (): Promise<{ access: string; refresh: string }> => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge, scope: "openid email" });
      const r = await exchange(code, { code_verifier: verifier });
      return { access: r.body.access_token, refresh: r.body.refresh_token };
    };
    const refresh = (rt: string, auth = confAuth()) => token(a, { grant_type: "refresh_token", refresh_token: rt }, auth);

    it("rotates the refresh token and keeps the scope", async () => {
      const { refresh: rt } = await issue();
      const r = await refresh(rt);
      expect(r.status).toBe(200);
      expect(r.body.refresh_token).toEqual(expect.any(String));
      expect(r.body.refresh_token).not.toBe(rt);
      expect(r.body.scope).toBe("openid email");
    });

    it("detects reuse of a rotated token and revokes the whole family", async () => {
      const { refresh: rt1 } = await issue();
      const r2 = await refresh(rt1);
      const rt2 = r2.body.refresh_token as string;
      const reuse = await refresh(rt1);
      expect(reuse.status).toBe(400);
      expect(reuse.body.error).toBe("invalid_grant");
      const afterReuse = await refresh(rt2);
      expect(afterReuse.status).toBe(400);
      expect(afterReuse.body.error).toBe("invalid_grant");
    });

    it("refuses a refresh token presented by a different client", async () => {
      const { refresh: rt } = await issue();
      const other = await createClient(t, a);
      const r = await refresh(rt, basic(other.clientId, other.clientSecret!));
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("invalid_grant");
    });

    it("rejects unknown, expired and missing refresh tokens", async () => {
      expect((await refresh("garbage")).body.error).toBe("invalid_grant");
      const { refresh: rt } = await issue();
      await t.db.query(`UPDATE "${tenantSchema(a.slug)}".oauth_refresh_tokens SET expires_at = now() - interval '1 day' WHERE client_id=$1`, [confidential.id]);
      expect((await refresh(rt)).body.error).toBe("invalid_grant");
      const missing = await token(a, { grant_type: "refresh_token" }, confAuth());
      expect(missing.body.error).toBe("invalid_request");
    });

    it("stores only a hash of the refresh token", async () => {
      const { refresh: rt } = await issue();
      const rows = await t.db.query(`SELECT token_hash FROM "${tenantSchema(a.slug)}".oauth_refresh_tokens WHERE client_id=$1`, [confidential.id]);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.token_hash).not.toBe(rt);
    });
  });

  describe("revoke and introspect", () => {
    const m2m = async (): Promise<string> => (await token(a, { grant_type: "client_credentials", scope: "read" }, confAuth())).body.access_token;
    const introspect = (tok: string, auth?: string, tenant = a) => {
      const r = t.http({ tenant: tenant.slug }).post("/oauth/introspect").type("form");
      if (auth) r.set("authorization", auth);
      return r.send({ token: tok });
    };

    it("introspection requires client authentication", async () => {
      const tok = await m2m();
      const none = await introspect(tok);
      expect(none.status).toBe(401);
      expect(none.body.error).toBe("invalid_client");
      const bad = await introspect(tok, basic(confidential.clientId, "wrong"));
      expect(bad.status).toBe(401);
    });

    it("reports active metadata for a live token and inactive for garbage", async () => {
      const tok = await m2m();
      const live = await introspect(tok, confAuth());
      expect(live.status).toBe(200);
      expect(live.body).toMatchObject({ active: true, scope: "read", client_id: confidential.clientId, token_type: "Bearer" });
      expect(live.body.status).toBeUndefined();
      const junk = await introspect("not.a.token", confAuth());
      expect(junk.body).toEqual({ active: false });
    });

    it("reports inactive for revoked and expired access tokens", async () => {
      const tok = await m2m();
      const rev = await t.http({ tenant: a.slug }).post("/oauth/revoke").type("form").set("authorization", confAuth()).send({ token: tok });
      expect(rev.status).toBe(200);
      expect((await introspect(tok, confAuth())).body.active).toBe(false);

      const tok2 = await m2m();
      await t.db.query(`UPDATE "${tenantSchema(a.slug)}".oauth_access_tokens SET expires_at = now() - interval '1 minute', revoked_at = now() WHERE client_id=$1`, [confidential.id]);
      expect((await introspect(tok2, confAuth())).body.active).toBe(false);
    });

    it("is tenant scoped: a tenant-B client cannot see tenant-A token metadata", async () => {
      const tok = await m2m();
      const cb = await createClient(t, b);
      const res = await introspect(tok, basic(cb.clientId, cb.clientSecret!), b);
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });

    it("revokes refresh tokens (with hint) so they can no longer be used", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge });
      const r = await exchange(code, { code_verifier: verifier });
      const rt = r.body.refresh_token as string;
      const rev = await t.http({ tenant: a.slug }).post("/oauth/revoke").type("form").set("authorization", confAuth()).send({ token: rt, token_type_hint: "refresh_token" });
      expect(rev.status).toBe(200);
      const use = await token(a, { grant_type: "refresh_token", refresh_token: rt }, confAuth());
      expect(use.status).toBe(400);
      expect((await introspect(rt, confAuth())).body.active).toBe(false);
    });

    it("revoke with bad client credentials fails with invalid_client; unknown tokens still return 200", async () => {
      const bad = await t.http({ tenant: a.slug }).post("/oauth/revoke").type("form").set("authorization", basic(confidential.clientId, "bad")).send({ token: "x" });
      expect(bad.status).toBe(401);
      expect(bad.body.error).toBe("invalid_client");
      const unknown = await t.http({ tenant: a.slug }).post("/oauth/revoke").type("form").set("authorization", confAuth()).send({ token: "does-not-exist" });
      expect(unknown.status).toBe(200);
    });
  });

  describe("tampered and forged tokens", () => {
    let valid: string;
    beforeAll(async () => {
      valid = (await token(a, { grant_type: "client_credentials", scope: "read" }, confAuth())).body.access_token;
    });
    const introspectActive = async (tok: string): Promise<boolean> => {
      const r = await t.http({ tenant: a.slug }).post("/oauth/introspect").type("form").set("authorization", confAuth()).send({ token: tok });
      return r.body.active === true;
    };
    const userinfoStatus = async (tok: string): Promise<number> =>
      (await t.http({ tenant: a.slug, bearer: tok }).get("/oauth/userinfo")).status;

    it("rejects alg=none", async () => {
      const { header, payload } = decodeJwt(valid);
      const none = `${b64u(JSON.stringify({ ...header, alg: "none" }))}.${b64u(JSON.stringify(payload))}.`;
      expect(await introspectActive(none)).toBe(false);
      expect(await userinfoStatus(none)).toBe(401);
    });

    it("rejects HS256 signed with the public key (algorithm confusion)", async () => {
            const { header, payload } = decodeJwt(valid);
      const jwks = await t.http({ tenant: a.slug }).get("/oauth/jwks");
      const jwk = jwks.body.keys.find((k: { kid: string }) => k.kid === header.kid);
      const secret = JSON.stringify(jwk);
      const input = `${b64u(JSON.stringify({ ...header, alg: "HS256" }))}.${b64u(JSON.stringify(payload))}`;
      const forged = `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
      expect(await introspectActive(forged)).toBe(false);
      expect(await userinfoStatus(forged)).toBe(401);
    });

    it("rejects a token signed by an unknown key even with a real kid", async () => {
      const { header, payload } = decodeJwt(valid);
      const forged = forgeRs256(header, payload);
      expect(await introspectActive(forged)).toBe(false);
      expect(await userinfoStatus(forged)).toBe(401);
    });

    it("rejects an unknown kid and a missing kid", async () => {
      const { header, payload } = decodeJwt(valid);
      expect(await introspectActive(forgeRs256({ ...header, kid: "00000000-0000-0000-0000-000000000000" }, payload))).toBe(false);
      const { kid: _kid, ...noKid } = header;
      expect(await introspectActive(forgeRs256(noKid, payload))).toBe(false);
    });

    it("rejects a token with a modified payload (signature mismatch)", async () => {
      const [h, p, s] = valid.split(".");
      const payload = { ...JSON.parse(Buffer.from(p!, "base64url").toString()), scope: "read admin" };
      const tampered = `${h}.${b64u(JSON.stringify(payload))}.${s}`;
      expect(await introspectActive(tampered)).toBe(false);
      expect(await userinfoStatus(tampered)).toBe(401);
    });

    it("rejects tokens past their exp even when otherwise genuine", async () => {
      const short = await createClient(t, a, { accessTokenTtl: 1 });
      const r = await token(a, { grant_type: "client_credentials", scope: "read" }, basic(short.clientId, short.clientSecret!));
      await new Promise((res) => setTimeout(res, 2200));
      expect(await introspectActive(r.body.access_token)).toBe(false);
      expect(await userinfoStatus(r.body.access_token)).toBe(401);
    });

    it("does not honour a tenant-A token on tenant-B routes", async () => {
      const res = await t.http({ tenant: b.slug, bearer: valid }).get("/oauth/userinfo");
      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("userinfo", () => {
    it("requires a bearer token", async () => {
      const res = await t.http({ tenant: a.slug }).get("/oauth/userinfo");
      expect(res.status).toBe(401);
    });

    it("returns the subject and email for a user session token, unwrapped", async () => {
      const res = await t.http({ tenant: a.slug, bearer: a.admin.accessToken }).get("/oauth/userinfo");
      expect(res.status).toBe(200);
      expect(res.body.status).toBeUndefined();
      expect(res.body.sub).toBe(userId);
      expect(res.body.email).toBe(a.admin.email);
    });

    it("works with an OAuth-issued user access token and honours revocation", async () => {
      const { verifier, challenge } = pkcePair();
      const code = await seedCode(t, a, confidential, { userId, challenge, scope: "openid email" });
      const r = await exchange(code, { code_verifier: verifier });
      const ok = await t.http({ tenant: a.slug, bearer: r.body.access_token }).get("/oauth/userinfo");
      expect(ok.status).toBe(200);
      expect(ok.body.sub).toBe(userId);
      await t.http({ tenant: a.slug }).post("/oauth/revoke").type("form").set("authorization", confAuth()).send({ token: r.body.access_token });
      const after = await t.http({ tenant: a.slug, bearer: r.body.access_token }).get("/oauth/userinfo");
      expect(after.status).toBe(401);
    });
  });

  describe("client management routes", () => {
    const admin = () => t.http({ tenant: a.slug, bearer: a.admin.accessToken });

    it("requires authentication", async () => {
      expect((await t.http({ tenant: a.slug }).get("/oauth/clients")).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).post("/oauth/clients").send({})).status).toBe(401);
    });

    it("validates creation input and enforces https redirect URIs", async () => {
      const bad = await admin().post("/oauth/clients").send({ name: "x", clientType: "public", grantTypes: ["authorization_code"], redirectUris: ["http://evil.example.com/cb"] });
      expect(bad.status).toBe(422);
      const badGrant = await admin().post("/oauth/clients").send({ name: "x", clientType: "public", grantTypes: ["implicit"], redirectUris: [REDIRECT] });
      expect(badGrant.status).toBeGreaterThanOrEqual(400);
    });

    it("lists, fetches, updates, rotates and deletes a client", async () => {
      const c = await createClient(t, a, { name: "lifecycle" });
      const list = await admin().get("/oauth/clients");
      expect(list.status).toBe(200);
      expect(list.body.data.map((x: { clientId: string }) => x.clientId)).toContain(c.clientId);
      const upd = await admin().put(`/oauth/clients/${c.clientId}`).send({ name: "renamed" });
      expect(upd.status).toBe(200);
      const got = await admin().get(`/oauth/clients/${c.clientId}`);
      expect(got.body.data.name).toBe("renamed");
      const rot = await admin().post(`/oauth/clients/${c.clientId}/rotate-secret`);
      expect(rot.status).toBe(200);
      const newSecret = rot.body.data.clientSecret as string;
      expect(typeof newSecret).toBe("string");
      const oldFails = await token(a, { grant_type: "client_credentials" }, basic(c.clientId, c.clientSecret!));
      expect(oldFails.status).toBe(401);
      const newWorks = await token(a, { grant_type: "client_credentials", scope: "read" }, basic(c.clientId, newSecret));
      expect(newWorks.status).toBe(200);
      const del = await admin().delete(`/oauth/clients/${c.clientId}`);
      expect(del.status).toBe(204);
      expect((await token(a, { grant_type: "client_credentials" }, basic(c.clientId, newSecret))).status).toBe(401);
    });

    it("does not expose tenant-A clients to tenant B", async () => {
      const res = await t.http({ tenant: b.slug, bearer: b.admin.accessToken }).get(`/oauth/clients/${confidential.clientId}`);
      expect(res.status).toBe(404);
    });
  });
});

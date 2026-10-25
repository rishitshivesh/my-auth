import {
  cookieValue, cookiesOf, createTenant, createTestApp, extractLink, registerAndVerifyUser, tokenFromLink, uniqueEmail,
  OTHER_STRONG_PASSWORD, STRONG_PASSWORD, type TenantFixture, type TestApp, type UserFixture,
} from "../support";

const PORTAL_DEST = "http://localhost:3000/welcome?x=1";

describe("email links: redirectUri and cross-device polling", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let user: UserFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    user = await registerAndVerifyUser(t, tenant);
    t.mail.clear();
  });

  const anon = () => t.http({ tenant: tenant.slug });
  const magicToken = (): string => tokenFromLink(extractLink(t.mail.last(user.email, "magic-link")!, "/u/magic-link"));

  describe("redirectUri", () => {
    it.each(["https://evil.example/cb", "javascript:alert(1)", "http://localhost:3000@evil.example/", "//evil.example"])(
      "is refused for %s on every link-creating endpoint, whether or not the account exists",
      async (redirectUri) => {
        for (const email of [user.email, uniqueEmail("ghost")]) {
          expect((await anon().post("/auth/magic-link/send").send({ email, redirectUri })).status).toBe(422);
          expect((await anon().post("/auth/forgot-password").send({ email, redirectUri })).status).toBe(422);
          expect((await anon().post("/auth/resend-verification").send({ email, redirectUri })).status).toBe(422);
        }
        expect(t.mail.allTo(user.email)).toHaveLength(0);
      },
    );

    it("magic link: stored with the token and returned on verify", async () => {
      await anon().post("/auth/magic-link/send").send({ email: user.email, redirectUri: PORTAL_DEST });
      const res = await anon().post("/auth/magic-link/verify").send({ token: magicToken() });
      expect(res.status).toBe(200);
      expect(res.body.redirectUri ?? res.body.data?.redirectUri).toBe(PORTAL_DEST);
    });

    it("reset: returned by validate and by the reset itself", async () => {
      await anon().post("/auth/forgot-password").send({ email: user.email, redirectUri: PORTAL_DEST });
      const token = tokenFromLink(extractLink(t.mail.last(user.email, "password-reset")!, "/reset-password"));
      expect((await anon().get("/auth/reset-password/validate").query({ token })).body.data.redirectUri).toBe(PORTAL_DEST);
      const done = await anon().post("/auth/reset-password").send({ token, password: OTHER_STRONG_PASSWORD });
      expect(done.body.data.redirectUri).toBe(PORTAL_DEST);
    });

    it("verification: returned by verify-email", async () => {
      const email = uniqueEmail("unverified");
      expect((await anon().post("/auth/register").send({ email, password: STRONG_PASSWORD })).status).toBe(201);
      t.mail.clear();
      await anon().post("/auth/resend-verification").send({ email, redirectUri: PORTAL_DEST });
      const token = tokenFromLink(extractLink(t.mail.last(email, "verify-email")!, "/verify-email"));
      const res = await anon().post("/auth/verify-email").send({ token });
      expect(res.status).toBe(200);
      expect(res.body.data.redirectUri).toBe(PORTAL_DEST);
    });

    it("none requested: none returned", async () => {
      await anon().post("/auth/magic-link/send").send({ email: user.email });
      const res = await anon().post("/auth/magic-link/verify").send({ token: magicToken() });
      expect(JSON.stringify(res.body)).not.toContain("redirectUri");
    });
  });

  describe("magic-link polling", () => {
    it("known and unknown emails both get a nonce (no enumeration)", async () => {
      const known = await anon().post("/auth/magic-link/send").send({ email: user.email, poll: true });
      const ghost = await anon().post("/auth/magic-link/send").send({ email: uniqueEmail("ghost"), poll: true });
      for (const r of [known, ghost]) {
        expect(r.status).toBe(200);
        expect(r.body.data.pollingNonce).toMatch(/^[0-9a-f]{64}$/);
        expect(r.body.data.expiresInSeconds).toBe(600);
      }
      expect((await anon().post("/auth/magic-link/send").send({ email: user.email })).body.data.pollingNonce).toBeUndefined();
    });

    it("pending until another device verifies, then one session for the polling device, once", async () => {
      const send = await anon().post("/auth/magic-link/send").send({ email: user.email, poll: true });
      const nonce = send.body.data.pollingNonce as string;
      const poll = () => anon().post("/auth/magic-link/poll").send({ pollingNonce: nonce });

      expect((await poll()).body.status ?? (await poll()).body.data?.status).toBe("pending");

      // device B opens the link
      const b = await anon().post("/auth/magic-link/verify").send({ token: magicToken() });
      expect(b.status).toBe(200);

      const a = await poll();
      expect(a.status).toBe(200);
      const cookies = cookiesOf(a);
      expect(cookieValue(cookies, "accessToken")).not.toBe("");
      expect(JSON.stringify(a.body)).not.toMatch(/eyJ/);
      expect((await t.http({ tenant: tenant.slug, cookies }).get("/auth/me")).status).toBe(200);

      const again = await poll();
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("LINK_ALREADY_USED");
    });

    it("unknown or foreign nonces stay pending; the link alone never redeems", async () => {
      const unknown = await anon().post("/auth/magic-link/poll").send({ pollingNonce: "a".repeat(64) });
      expect(unknown.status).toBe(200);
      expect(JSON.stringify(unknown.body)).toContain("pending");
      expect((await anon().post("/auth/magic-link/poll").send({ pollingNonce: "short" })).status).toBe(422);
    });

    it("nonces do not cross tenants", async () => {
      const other = await createTenant(t);
      const nonce = (await anon().post("/auth/magic-link/send").send({ email: user.email, poll: true })).body.data.pollingNonce as string;
      await anon().post("/auth/magic-link/verify").send({ token: magicToken() });
      const foreign = await t.http({ tenant: other.slug }).post("/auth/magic-link/poll").send({ pollingNonce: nonce });
      expect(JSON.stringify(foreign.body)).toContain("pending");
    });
  });
});

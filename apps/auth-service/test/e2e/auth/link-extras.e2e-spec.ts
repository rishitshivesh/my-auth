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

  describe("magic-link cross-device completion (number matching)", () => {
    const sendPoll = async (email = user.email) => (await anon().post("/auth/magic-link/send").send({ email, poll: true, })).body.data as { pollingNonce: string; matchCode: string; expiresInSeconds: number };
    const poll = (nonce: string) => anon().post("/auth/magic-link/poll").send({ pollingNonce: nonce });
    const verify = (token: string, matchCode?: string) => anon().post("/auth/magic-link/verify").send({ token, ...(matchCode ? { matchCode } : {}) });
    const statusOf = (res: { body: { status?: string; data?: { status?: string } } }) => res.body.status ?? res.body.data?.status;

    it("known and unknown emails both get a nonce and a 6-digit code (no enumeration); the code is never emailed", async () => {
      const known = await sendPoll();
      const ghost = await sendPoll(uniqueEmail("ghost"));
      for (const r of [known, ghost]) {
        expect(r.pollingNonce).toMatch(/^[0-9a-f]{64}$/);
        expect(r.matchCode).toMatch(/^\d{6}$/);
        expect(r.expiresInSeconds).toBe(600);
      }
      expect(JSON.stringify(t.mail.allTo(user.email))).not.toContain(known.matchCode);
      const plain = (await anon().post("/auth/magic-link/send").send({ email: user.email })).body.data;
      expect(plain.pollingNonce).toBeUndefined();
      expect(plain.matchCode).toBeUndefined();
    });

    it("preview shows where the request came from, requires a match code, and never consumes the link", async () => {
      await anon().post("/auth/magic-link/send").send({ email: user.email, poll: true }).set("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537").set("x-forwarded-for", "203.0.113.9");
      const token = magicToken();
      for (let i = 0; i < 3; i++) {
        const p = await anon().get("/auth/magic-link/preview").query({ token });
        expect(p.status).toBe(200);
        expect(p.body.data).toEqual({ requestedFrom: { userAgent: "Chrome on Windows", ip: "203.0.113.9" }, requiresMatchCode: true });
      }
      expect((await verify(token)).status).toBe(200);
      expect((await anon().get("/auth/magic-link/preview").query({ token })).body.code).toBe("LINK_ALREADY_USED");
      expect((await anon().get("/auth/magic-link/preview").query({ token: "f".repeat(64) })).status).toBe(401);
    });

    it("DEVICE-CODE PHISHING: a plain click signs in the clicker only and voids the poll for good", async () => {
      const attacker = await sendPoll(); // attacker requests a link for the victim's address
      const click = await verify(magicToken()); // the victim clicks it normally
      expect(click.status).toBe(200);
      expect(cookieValue(cookiesOf(click), "accessToken")).not.toBe("");
      for (let i = 0; i < 2; i++) {
        const res = await poll(attacker.pollingNonce);
        expect(res.status).toBe(200);
        expect(statusOf(res)).toBe("pending");
        expect(cookieValue(cookiesOf(res), "accessToken")).toBe("");
      }
    });

    it("the correct matchCode completes only the poller; the confirming device gets no session", async () => {
      const req = await sendPoll();
      expect(statusOf(await poll(req.pollingNonce))).toBe("pending");
      const confirm = await verify(magicToken(), req.matchCode);
      expect(confirm.status).toBe(200);
      expect(statusOf(confirm)).toBe("confirmed-on-other-device");
      expect(cookieValue(cookiesOf(confirm), "accessToken")).toBe("");
      expect(cookieValue(cookiesOf(confirm), "refreshToken")).toBe("");

      const done = await poll(req.pollingNonce);
      expect(done.status).toBe(200);
      const cookies = cookiesOf(done);
      expect(cookieValue(cookies, "accessToken")).not.toBe("");
      expect(JSON.stringify(done.body)).not.toMatch(/eyJ/);
      expect((await t.http({ tenant: tenant.slug, cookies }).get("/auth/me")).status).toBe(200);
      const again = await poll(req.pollingNonce);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("LINK_ALREADY_USED");
    });

    it("a wrong code does not spend the link; brute force is capped at 5 and then even the right code fails", async () => {
      const req = await sendPoll();
      const token = magicToken();
      const wrong = req.matchCode === "000000" ? "111111" : "000000";
      const first = await verify(token, wrong);
      expect(first.status).toBe(401);
      expect(first.body.code).toBe("AUTH_OTP_INVALID");
      for (let i = 0; i < 4; i++) expect((await verify(token, wrong)).status).toBe(401);
      expect((await verify(token, req.matchCode)).status).toBe(401);
      expect(statusOf(await poll(req.pollingNonce))).toBe("pending");
      // the link itself still works as an ordinary sign-in
      expect((await verify(token)).status).toBe(200);
    });

    it("a malformed code is a validation error; a code on a link with no pending request is refused", async () => {
      await anon().post("/auth/magic-link/send").send({ email: user.email, poll: true });
      expect((await verify(magicToken(), "12ab56")).status).toBe(422);
      t.mail.clear();
      await anon().post("/auth/magic-link/send").send({ email: user.email });
      expect((await verify(magicToken(), "123456")).status).toBe(401);
    });

    it("unknown or foreign nonces stay pending; nonces do not cross tenants", async () => {
      const unknown = await poll("a".repeat(64));
      expect(statusOf(unknown)).toBe("pending");
      expect((await poll("short")).status).toBe(422);
      const other = await createTenant(t);
      const req = await sendPoll();
      await verify(magicToken(), req.matchCode);
      const foreign = await t.http({ tenant: other.slug }).post("/auth/magic-link/poll").send({ pollingNonce: req.pollingNonce });
      expect(statusOf(foreign)).toBe("pending");
    });
  });
});

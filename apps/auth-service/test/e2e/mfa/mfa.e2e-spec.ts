import * as speakeasy from "speakeasy";
import { ApiException } from "@/common/http";
import { MfaService } from "@/modules/mfa/mfa.service";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { createTestApp, createTenant, loginUser, type TenantFixture, type TestApp } from "../support";
import { addMember, as, auditItems, decodeJwt, mintToken, type Member } from "../_shared/fixtures";
import { SoftAuthenticator } from "./webauthn-authenticator";

const totpNow = (secret: string, offsetSteps = 0): string =>
  speakeasy.totp({ secret, encoding: "base32", time: Math.floor(Date.now() / 1000) + offsetSteps * 30 });

describe("mfa", () => {
  let t: TestApp;
  let fx: TenantFixture;
  const rpId = process.env["WEBAUTHN_RP_ID"] ?? "localhost";
  const origin = process.env["WEBAUTHN_ORIGIN"] ?? "http://localhost:3000";

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const client = (m: Member, token = m.accessToken) => as(t, fx.slug, token);
  const inTenant = <T>(work: () => Promise<T>): Promise<T> => t.app.get(TenantJobRunner).runInTenant(fx.slug, work);

  /** Enrols TOTP for a fresh member through the API. */
  async function enrolled(): Promise<{ m: Member; secret: string; backupCodes: string[]; usedCode: string }> {
    const m = await addMember(t, fx, "member");
    const setup = await client(m).post("/mfa/setup/totp");
    expect(setup.status).toBe(201);
    const secret = setup.body.data.secret as string;
    const usedCode = totpNow(secret);
    const enable = await client(m).post("/mfa/verify/totp").send({ token: usedCode });
    expect(enable.status).toBe(200);
    return { m, secret, backupCodes: enable.body.data.backupCodes as string[], usedCode };
  }

  describe("authorization", () => {
    it.each([
      ["get", "/mfa/status"], ["post", "/mfa/setup/totp"], ["post", "/mfa/verify/totp"], ["delete", "/mfa/totp"],
      ["post", "/mfa/backup-codes/regenerate"], ["post", "/mfa/verify/backup-code"], ["delete", "/mfa/all"],
      ["post", "/mfa/request-email-otp"], ["post", "/mfa/verify-email-otp"], ["post", "/mfa/webauthn/register/start"],
      ["post", "/mfa/webauthn/register/finish"], ["get", "/mfa/webauthn/credentials"], ["delete", "/mfa/webauthn/credentials/abc"],
    ])("%s %s requires authentication", async (method, path) => {
      const c = t.http({ tenant: fx.slug }) as unknown as Record<string, (p: string) => import("supertest").Test>;
      expect((await c[method]!(path).send({})).status).toBe(401);
    });

    it("a revoked session cannot manage MFA", async () => {
      const m = await addMember(t, fx, "member");
      await client(m).delete("/sessions/all");
      expect((await client(m).get("/mfa/status")).status).toBe(401);
    });
  });

  describe("TOTP", () => {
    it("status starts empty with a server-side grace period", async () => {
      const m = await addMember(t, fx, "member");
      const res = await client(m).get("/mfa/status");
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(false);
      expect(res.body.data.grace.startedAt).toBeTruthy();
    });

    it("setup returns a secret and QR; enabling needs a valid code and returns backup codes", async () => {
      const m = await addMember(t, fx, "member");
      expect((await client(m).post("/mfa/verify/totp").send({ token: "123456" })).status).toBe(409); // not started
      const setup = await client(m).post("/mfa/setup/totp");
      expect(setup.body.data.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(setup.body.data.secret).toMatch(/^[A-Z2-7]+=*$/);
      expect((await client(m).post("/mfa/verify/totp").send({ token: "12ab56" })).status).toBe(422);
      const wrong = await client(m).post("/mfa/verify/totp").send({ token: "000000" });
      expect(wrong.status).toBe(401);
      expect((await client(m).get("/mfa/status")).body.data.enabled).toBe(false);
      const ok = await client(m).post("/mfa/verify/totp").send({ token: totpNow(setup.body.data.secret) });
      expect(ok.status).toBe(200);
      expect(ok.body.data.backupCodes).toHaveLength(10);
      for (const code of ok.body.data.backupCodes as string[]) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const status = await client(m).get("/mfa/status");
      expect(status.body.data.enabled).toBe(true);
      expect(status.body.data.methods).toContain("totp");
      expect(status.body.data.backupCodesRemaining).toBe(10);
    });

    it("enabling twice is a conflict, and re-running setup cannot swap the enrolled secret", async () => {
      const { m, secret } = await enrolled();
      const again = await client(m).post("/mfa/verify/totp").send({ token: totpNow(secret, 1) });
      expect(again.status).toBe(409);
      const resetup = await client(m).post("/mfa/setup/totp");
      expect(resetup.status).toBe(409);
      // The original authenticator still works.
      const mfa = t.app.get(MfaService);
      const ok = await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, totpNow(secret, 1)));
      expect(ok).toBe(true);
    });

    it("a TOTP code is single use (step replay blocked), including the one that enabled MFA", async () => {
      const { m, secret, usedCode } = await enrolled();
      const mfa = t.app.get(MfaService);
      expect(await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, usedCode))).toBe(false);
      const next = totpNow(secret, 1);
      expect(await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, next))).toBe(true);
      expect(await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, next))).toBe(false);
    });

    it("five wrong codes void the login challenge; even the right code is then refused", async () => {
      const { m, secret } = await enrolled();
      const mfa = t.app.get(MfaService);
      const challenge = `chal-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        const err = await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, "000000", challenge)).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiException);
        expect((err as ApiException).code).toBe("AUTH_MFA_INVALID");
      }
      const voided = await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, totpNow(secret, 1), challenge)).catch((e: unknown) => e);
      expect((voided as ApiException).code).toBe("AUTH_TOKEN_EXPIRED");
      // A fresh challenge is unaffected.
      expect(await inTenant(() => mfa.verifyTotp(m.id, fx.tenantId, totpNow(secret, 1), `fresh-${Date.now()}`))).toBe(true);
    });

    it("disabling needs a recent login (step-up) and is audited", async () => {
      const { m } = await enrolled();
      const claims = decodeJwt(m.accessToken);
      const stale = await mintToken(t, fx.tenantId, {
        sub: claims["sub"], email: claims["email"], tenantId: fx.tenantId, tenantSlug: fx.slug,
        sessionId: claims["sessionId"], groups: claims["groups"], authTime: Math.floor(Date.now() / 1000) - 3600,
      });
      const denied = await client(m, stale).delete("/mfa/totp");
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("ACCESS_RECENT_AUTH_REQUIRED");
      expect((await client(m, stale).delete("/mfa/all")).body.code).toBe("ACCESS_RECENT_AUTH_REQUIRED");
      expect((await client(m).get("/mfa/status")).body.data.enabled).toBe(true);

      const ok = await client(m).delete("/mfa/totp");
      expect(ok.status).toBe(200);
      expect((await client(m).get("/mfa/status")).body.data.enabled).toBe(false);
      expect((await auditItems(t, fx)).filter((i) => i.eventType === "mfa.totp_disabled" && i.userId === m.id)).toHaveLength(1);
      expect(t.mail.allTo(m.email).length).toBeGreaterThan(0);
    });

    it("enabling is audited and disable-all clears every method", async () => {
      const { m } = await enrolled();
      expect((await auditItems(t, fx)).some((i) => i.eventType === "mfa.totp_enabled" && i.userId === m.id)).toBe(true);
      expect((await client(m).delete("/mfa/all")).status).toBe(200);
      const st = await client(m).get("/mfa/status");
      expect(st.body.data.enabled).toBe(false);
      expect(st.body.data.backupCodesRemaining).toBe(0);
    });

    it("disabling TOTP when nothing is enrolled is a client error, not a 500", async () => {
      const m = await addMember(t, fx, "member");
      const res = await client(m).delete("/mfa/totp");
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("MFA state is per tenant: another tenant's user cannot see or alter it", async () => {
      const { m } = await enrolled();
      const other = await createTenant(t);
      const res = await t.http({ tenant: other.slug, bearer: m.accessToken }).get("/mfa/status");
      expect([401, 403]).toContain(res.status);
      expect((await as(t, other.slug, other.admin.accessToken).get("/mfa/status")).body.data.enabled).toBe(false);
    });
  });

  describe("backup codes", () => {
    it("are single use, format-validated, and regeneration invalidates the old set", async () => {
      const { m, backupCodes } = await enrolled();
      expect((await client(m).post("/mfa/verify/backup-code").send({ code: "bad" })).status).toBe(422);
      const first = await client(m).post("/mfa/verify/backup-code").send({ code: backupCodes[0] });
      expect(first.body.data.valid).toBe(true);
      const replay = await client(m).post("/mfa/verify/backup-code").send({ code: backupCodes[0] });
      expect(replay.body.data.valid).toBe(false);
      expect((await client(m).get("/mfa/status")).body.data.backupCodesRemaining).toBe(9);

      const regen = await client(m).post("/mfa/backup-codes/regenerate");
      expect(regen.status).toBe(200);
      expect(regen.body.data.backupCodes).toHaveLength(10);
      expect(regen.body.data.count).toBe(10);
      const old = await client(m).post("/mfa/verify/backup-code").send({ code: backupCodes[1] });
      expect(old.body.data.valid).toBe(false);
      const fresh = await client(m).post("/mfa/verify/backup-code").send({ code: regen.body.data.backupCodes[0] });
      expect(fresh.body.data.valid).toBe(true);
      expect((await client(m).get("/mfa/status")).body.data.backupCodesRemaining).toBe(9);
    });

    it("two parallel uses of one code succeed at most once", async () => {
      const { m, backupCodes } = await enrolled();
      const results = await Promise.all([1, 2, 3].map(() => client(m).post("/mfa/verify/backup-code").send({ code: backupCodes[2] })));
      expect(results.filter((r) => r.body.data?.valid === true)).toHaveLength(1);
    });

    it("cannot be regenerated before MFA is enabled", async () => {
      const m = await addMember(t, fx, "member");
      expect((await client(m).post("/mfa/backup-codes/regenerate")).status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("email OTP", () => {
    const codeFrom = (m: Member): string => {
      const mail = t.mail.last(m.email, "otp") ?? t.mail.allTo(m.email).at(-1)!;
      const match = JSON.stringify(mail.props).match(/\d{6}/);
      return match![0];
    };

    it("request -> wrong code -> right code (single use)", async () => {
      const m = await addMember(t, fx, "member");
      t.mail.clear();
      const sent = await client(m).post("/mfa/request-email-otp");
      expect(sent.status).toBe(201);
      const code = codeFrom(m);
      const wrong = await client(m).post("/mfa/verify-email-otp").send({ code: code === "000000" ? "111111" : "000000" });
      expect(wrong.status).toBe(401);
      expect((await client(m).post("/mfa/verify-email-otp").send({ code })).status).toBe(201);
      expect((await client(m).post("/mfa/verify-email-otp").send({ code })).status).toBe(401);
    });

    it("six wrong guesses destroy the code", async () => {
      const m = await addMember(t, fx, "member");
      t.mail.clear();
      await client(m).post("/mfa/request-email-otp");
      const code = codeFrom(m);
      const bad = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 6; i++) await client(m).post("/mfa/verify-email-otp").send({ code: bad });
      expect((await client(m).post("/mfa/verify-email-otp").send({ code })).status).toBe(401);
    });

    it("a code for user A does not verify for user B", async () => {
      const a = await addMember(t, fx, "member");
      const b = await addMember(t, fx, "member");
      t.mail.clear();
      await client(a).post("/mfa/request-email-otp");
      const code = codeFrom(a);
      expect((await client(b).post("/mfa/verify-email-otp").send({ code })).status).toBe(401);
    });

    it("rejects non-numeric / missing codes", async () => {
      const m = await addMember(t, fx, "member");
      expect((await client(m).post("/mfa/verify-email-otp").send({})).status).toBe(422);
      expect((await client(m).post("/mfa/verify-email-otp").send({ code: "abcdef" })).status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("WebAuthn / passkeys", () => {
    async function register(m: Member, startCounter = 5): Promise<{ auth: SoftAuthenticator; credentialId: string }> {
      const start = await client(m).post("/mfa/webauthn/register/start");
      expect(start.status).toBe(201);
      const auth = new SoftAuthenticator({ rpId, origin }, startCounter);
      const finish = await client(m).post("/mfa/webauthn/register/finish").send({ response: auth.register(start.body.data.challenge), deviceName: "Soft key" });
      expect({ s: finish.status, c: finish.body.code, d: finish.body.detail }).toEqual({ s: 201, c: undefined, d: undefined });
      expect(finish.body.data.success).toBe(true);
      return { auth, credentialId: finish.body.data.credentialId as string };
    }

    it("registers, lists and deletes a passkey; events are written", async () => {
      const m = await addMember(t, fx, "member");
      const { credentialId } = await register(m);
      const list = await client(m).get("/mfa/webauthn/credentials");
      expect(list.body.data.credentials).toHaveLength(1);
      expect(list.body.data.credentials[0].id).toBe(credentialId);
      expect(list.body.data.credentials[0].deviceName).toBe("Soft key");
      expect((await client(m).get("/mfa/status")).body.data.methods).toContain("webauthn");
      expect((await client(m).delete("/mfa/webauthn/credentials/does-not-exist")).status).toBe(404);
      expect((await client(m).delete(`/mfa/webauthn/credentials/${credentialId}`)).status).toBe(200);
      expect((await client(m).get("/mfa/webauthn/credentials")).body.data.credentials).toHaveLength(0);
      expect((await client(m).get("/mfa/status")).body.data.methods).not.toContain("webauthn");
      const types = (await auditItems(t, fx)).filter((i) => i.userId === m.id).map((i) => i.eventType);
      expect(types).toEqual(expect.arrayContaining(["passkey.registered", "passkey.removed"]));
    });

    it("rejects a wrong challenge, wrong origin, replayed challenge and garbage", async () => {
      const m = await addMember(t, fx, "member");
      const auth = new SoftAuthenticator({ rpId, origin });
      const start = await client(m).post("/mfa/webauthn/register/start");
      const badChallenge = await client(m).post("/mfa/webauthn/register/finish").send({ response: auth.register("AAAA") });
      expect({ s: badChallenge.status, c: badChallenge.body.code }).toEqual({ s: 401, c: "PASSKEY_INVALID" });
      // The challenge is single use even after a failed attempt.
      const replay = await client(m).post("/mfa/webauthn/register/finish").send({ response: auth.register(start.body.data.challenge) });
      expect(replay.status).toBe(401);
      const start2 = await client(m).post("/mfa/webauthn/register/start");
      const wrongOrigin = await client(m).post("/mfa/webauthn/register/finish").send({ response: auth.register(start2.body.data.challenge, "https://evil.example.com") });
      expect(wrongOrigin.status).toBe(401);
      expect((await client(m).post("/mfa/webauthn/register/finish").send({ response: { nonsense: true } })).status).toBe(401);
      expect((await client(m).post("/mfa/webauthn/register/finish").send({})).status).toBe(422);
      expect((await client(m).get("/mfa/webauthn/credentials")).body.data.credentials).toHaveLength(0);
    });

    it("a challenge started by one user cannot be completed by another", async () => {
      const a = await addMember(t, fx, "member");
      const b = await addMember(t, fx, "member");
      const startA = await client(a).post("/mfa/webauthn/register/start");
      const auth = new SoftAuthenticator({ rpId, origin });
      const res = await client(b).post("/mfa/webauthn/register/finish").send({ response: auth.register(startA.body.data.challenge) });
      expect(res.status).toBe(401);
    });

    it("a passkey cannot be deleted by another user", async () => {
      const a = await addMember(t, fx, "member");
      const b = await addMember(t, fx, "member");
      const { credentialId } = await register(a);
      expect((await client(b).delete(`/mfa/webauthn/credentials/${credentialId}`)).status).toBe(404);
      expect((await client(a).get("/mfa/webauthn/credentials")).body.data.credentials).toHaveLength(1);
    });

    it("enforces the per-user passkey cap", async () => {
      const m = await addMember(t, fx, "member");
      for (let i = 0; i < 10; i++) await register(m, i);
      const over = await client(m).post("/mfa/webauthn/register/start");
      expect(over.status).toBeGreaterThanOrEqual(400);
      expect(over.status).toBeLessThan(500);
    });

    it("authentication succeeds with an advancing counter; a counter regression retires the credential and emails the user", async () => {
      const m = await addMember(t, fx, "member");
      const { auth, credentialId } = await register(m, 5);
      const web = t.app.get(WebAuthnService);

      const first = await inTenant(() => web.startAuthentication(m.id, fx.tenantId));
      auth.counter = 6;
      expect(await inTenant(() => web.finishAuthentication(m.id, fx.tenantId, auth.assert(first.options.challenge) as never, first.sessionNonce))).toBe(true);

      // The same nonce cannot be reused.
      const replayed = await inTenant(() => web.finishAuthentication(m.id, fx.tenantId, auth.assert(first.options.challenge) as never, first.sessionNonce)).catch((e: unknown) => e);
      expect((replayed as ApiException).code).toBe("PASSKEY_INVALID");

      // A clone replays counter 6: not strictly greater than the stored 6.
      t.mail.clear();
      const second = await inTenant(() => web.startAuthentication(m.id, fx.tenantId));
      auth.counter = 6;
      const regress = await inTenant(() => web.finishAuthentication(m.id, fx.tenantId, auth.assert(second.options.challenge) as never, second.sessionNonce)).catch((e: unknown) => e);
      expect((regress as ApiException).code).toBe("PASSKEY_INVALID");

      expect((await client(m).get("/mfa/webauthn/credentials")).body.data.credentials.find((c: { id: string }) => c.id === credentialId)).toBeUndefined();
      expect((await client(m).get("/mfa/status")).body.data.methods).not.toContain("webauthn");
      const cloned = (await auditItems(t, fx)).find((i) => i.eventType === "passkey.cloned" && i.userId === m.id);
      expect(cloned).toBeDefined();
      expect(cloned!.severity).toBe("critical");
      await new Promise((r) => setTimeout(r, 300));
      expect(t.mail.allTo(m.email).length).toBeGreaterThan(0);
    });

    it("an assertion signed by a different key is rejected without retiring the credential", async () => {
      const m = await addMember(t, fx, "member");
      const { credentialId } = await register(m, 1);
      const web = t.app.get(WebAuthnService);
      const impostor = new SoftAuthenticator({ rpId, origin }, 9);
      // Same credential id, different private key.
      Object.defineProperty(impostor, "credentialId", { value: Buffer.from(credentialId, "base64url") });
      const start = await inTenant(() => web.startAuthentication(m.id, fx.tenantId));
      const err = await inTenant(() => web.finishAuthentication(m.id, fx.tenantId, impostor.assert(start.options.challenge) as never, start.sessionNonce)).catch((e: unknown) => e);
      expect((err as ApiException).code).toBe("PASSKEY_INVALID");
      expect((await client(m).get("/mfa/webauthn/credentials")).body.data.credentials).toHaveLength(1);
    });
  });

  it("MFA endpoints work after a fresh login for the same user (cookies)", async () => {
    const m = await addMember(t, fx, "member");
    const login = await loginUser(t, fx, m.email, m.password);
    const res = await t.http({ tenant: fx.slug, cookies: login.cookies }).get("/mfa/status");
    expect(res.status).toBe(200);
  });
});

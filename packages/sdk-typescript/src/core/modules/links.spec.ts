import { describe, expect, it } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";
import { buildQuery } from "./context";
import {
  isLinkAlreadyUsed,
  isLinkExpired,
  isLinkWrongAccount,
  linkFailureReason,
} from "../errors";
import {
  isConfirmedOnOtherDevice,
  isMagicLinkPending,
  isMfaChallenge,
  isMfaEnrollmentRequired,
  isSessionEstablished,
} from "../api-types";

const SESSION = { tenantId: "t", tenantSlug: "acme", groups: [] };

describe("link error helpers", () => {
  it("classify the three LINK_* codes", async () => {
    const mk = async (code: string, status: number) => {
      const { client } = await makeClient(() => problem(status, code, "x"));
      return client.account.verifyEmail("t").catch((e: unknown) => e);
    };
    const expired = await mk("LINK_EXPIRED", 410);
    const used = await mk("LINK_ALREADY_USED", 409);
    const wrong = await mk("LINK_WRONG_ACCOUNT", 403);
    expect(linkFailureReason(expired)).toBe("expired");
    expect(isLinkExpired(expired)).toBe(true);
    expect(isLinkAlreadyUsed(used)).toBe(true);
    expect(isLinkWrongAccount(wrong)).toBe(true);
    expect(linkFailureReason(new Error("x"))).toBeUndefined();
    expect(linkFailureReason(await mk("AUTH_TOKEN_INVALID", 401))).toBeUndefined();
  });
});

describe("password reset by link", () => {
  it("validate does not consume (GET) and encodes the token", async () => {
    const { client, last } = await makeClient(() => envelope({ valid: true, expiresInSeconds: 600, redirectUri: "https://app" }));
    const status = await client.signIn.validateResetLink("a b");
    expect(status).toEqual({ valid: true, expiresInSeconds: 600, redirectUri: "https://app" });
    expect(last()).toMatchObject({ method: "GET", url: `${BASE}/auth/reset-password/validate?token=a+b` });
  });

  it("reset with token returns the redirect; an expired link throws", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "ok", redirectUri: "https://app" }));
    expect((await client.signIn.resetPasswordWithToken("t", "P@ss1")).redirectUri).toBe("https://app");
    expect(last().body).toEqual({ token: "t", password: "P@ss1" });
    const { client: c2 } = await makeClient(() => problem(410, "LINK_EXPIRED", "Expired"));
    await expect(c2.signIn.validateResetLink("t")).rejects.toMatchObject({ code: "LINK_EXPIRED", status: 410 });
  });

  it("forgotPassword forwards redirectUri", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "m" }));
    await client.forgotPassword("a@b.c", { redirectUri: "https://app" });
    expect(last().body).toEqual({ email: "a@b.c", redirectUri: "https://app" });
  });
});

describe("login-time MFA methods", () => {
  it("completeMfa sends the method payload", async () => {
    const { client, last } = await makeClient(() => envelope({ tenantSlug: "acme", session: SESSION, expiresIn: 900 }));
    await client.signIn.completeMfa({ tempToken: "t", method: "email", code: "123456" });
    expect(last().body).toEqual({ tempToken: "t", method: "email", code: "123456" });
    await client.signIn.completeMfa({ tempToken: "t", method: "webauthn", webauthnResponse: { id: "a" }, sessionNonce: "n" });
    expect(last().body).toMatchObject({ method: "webauthn", sessionNonce: "n" });
  });

  it("requestMfaEmailOtp and startMfaWebAuthn take the tempToken", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("email-otp") ? envelope({ message: "sent", expiresInSeconds: 600 }) : envelope({ challenge: "c", sessionNonce: "n" }),
    );
    expect((await client.signIn.requestMfaEmailOtp("t")).expiresInSeconds).toBe(600);
    expect((await client.signIn.startMfaWebAuthn("t")).sessionNonce).toBe("n");
    expect(calls.map((c) => c.body)).toEqual([{ tempToken: "t" }, { tempToken: "t" }]);
  });
});

describe("pre-session TOTP enrollment", () => {
  it("setup then confirm establishes the session and returns backup codes", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/setup") ? envelope({ secret: "S", qrCode: "data:" }) : envelope({ backupCodes: ["A", "B"], tenantSlug: "acme", session: SESSION, expiresIn: 900 }),
    );
    expect((await client.signIn.enrollTotpSetup("enr")).secret).toBe("S");
    const done = await client.signIn.enrollTotpConfirm("123456", "enr");
    expect(done.backupCodes).toEqual(["A", "B"]);
    expect(client.isAuthenticated()).toBe(true);
    expect(calls[1]?.body).toEqual({ code: "123456", enrollmentToken: "enr" });
  });

  it("confirm tolerates missing backupCodes and rejects bad codes", async () => {
    const { client } = await makeClient(() => envelope({ tenantSlug: "acme", expiresIn: 1 }));
    expect((await client.signIn.enrollTotpConfirm("1")).backupCodes).toEqual([]);
    const { client: c2 } = await makeClient(() => problem(401, "AUTH_MFA_INVALID", "bad"));
    await expect(c2.signIn.enrollTotpConfirm("0")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
  });
});

describe("magic link polling and redirect", () => {
  it("send with poll returns the nonce", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "m", expiresInSeconds: 900, pollingNonce: "pn" }));
    const sent = await client.sendMagicLink("a@b.c", { poll: true, redirectUri: "https://app" });
    expect(sent.pollingNonce).toBe("pn");
    expect(last().body).toEqual({ email: "a@b.c", redirectUri: "https://app", poll: true });
  });

  it("poll returns pending, then the verify result shapes", async () => {
    const answers = [
      ok({ status: "pending" }),
      ok({ tenantSlug: "acme", session: SESSION, expiresIn: 900, redirectUri: "https://app" }),
      ok({ mfaRequired: true, tempToken: "t", availableMethods: ["totp"] }),
      ok({ status: "mfa_enrollment_required" }),
    ];
    const { client } = await makeClient(() => answers.shift() ?? ok({}));
    const pending = await client.signIn.pollMagicLink("pn");
    expect(isMagicLinkPending(pending)).toBe(true);
    const done = await client.signIn.pollMagicLink("pn");
    expect(done).toMatchObject({ redirectUri: "https://app" });
    expect(client.isAuthenticated()).toBe(true);
    expect(isMfaChallenge(await client.signIn.pollMagicLink("pn") as never)).toBe(true);
    expect(isMfaEnrollmentRequired(await client.signIn.pollMagicLink("pn") as never)).toBe(true);
  });

  it("send with poll returns the number-matching code", async () => {
    const { client } = await makeClient(() => ok({ message: "m", expiresInSeconds: 600, pollingNonce: "n".repeat(40), matchCode: "123456" }));
    const sent = await client.sendMagicLink("a@b.c", { poll: true });
    expect(sent).toMatchObject({ matchCode: "123456", expiresInSeconds: 600 });
  });

  it("preview is a non-consuming GET and models an unknown requester", async () => {
    const { client, last } = await makeClient(() => ok({ requestedFrom: { userAgent: "Chrome on macOS", ip: "1.2.3.4" }, requiresMatchCode: true }));
    const preview = await client.previewMagicLink("a b");
    expect(preview).toEqual({ requestedFrom: { userAgent: "Chrome on macOS", ip: "1.2.3.4" }, requiresMatchCode: true });
    expect(last()).toMatchObject({ method: "GET", url: `${BASE}/auth/magic-link/preview?token=a+b` });
    const { client: c2 } = await makeClient(() => ok({ requestedFrom: null, requiresMatchCode: false }));
    expect((await c2.previewMagicLink("t")).requestedFrom).toBeNull();
  });

  it("verify with matchCode resolves confirmed-on-other-device and creates no session", async () => {
    const { client, last } = await makeClient(() => ok({ status: "confirmed-on-other-device", redirectUri: "https://app" }));
    const out = await client.verifyMagicLink("tok", { matchCode: "123456" });
    expect(last().body).toEqual({ token: "tok", matchCode: "123456" });
    expect(isConfirmedOnOtherDevice(out)).toBe(true);
    expect(isSessionEstablished(out)).toBe(false);
    expect(out).toMatchObject({ redirectUri: "https://app" });
    expect(client.isAuthenticated()).toBe(false);
  });

  it("a wrong match code surfaces AUTH_OTP_INVALID and a replayed poll surfaces LINK_ALREADY_USED", async () => {
    const { client } = await makeClient(() => problem(401, "AUTH_OTP_INVALID", "Wrong code"));
    await expect(client.verifyMagicLink("tok", { matchCode: "000000" })).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
    const { client: c2 } = await makeClient(() => problem(409, "LINK_ALREADY_USED", "Used"));
    const err = await c2.signIn.pollMagicLink("n".repeat(40)).catch((e: unknown) => e);
    expect(isLinkAlreadyUsed(err)).toBe(true);
  });

  it("verify carries redirectUri on every branch", async () => {
    const { client } = await makeClient(() => ok({ mfaRequired: true, tempToken: "t", redirectUri: "https://app" }));
    expect(await client.verifyMagicLink("x")).toMatchObject({ mfaRequired: true, redirectUri: "https://app" });
  });
});

describe("invites, tenant, social, branding, audit, saml", () => {
  it("invite requestNew and accept canSignInNow", async () => {
    const { client, last } = await makeClient((req) =>
      req.url.endsWith("request-new") ? envelope({ message: "m", expiresInDays: 7 }) : envelope({ message: "ok", canSignInNow: true }, 201),
    );
    expect((await client.invites.requestNew("t")).expiresInDays).toBe(7);
    expect((await client.invites.accept({ token: "t", name: "n", password: "p" })).canSignInNow).toBe(true);
    expect(last().url).toBe(`${BASE}/auth/invite/accept`);
  });

  it("tenant.register returns no tokens", async () => {
    const { client } = await makeClient(() => envelope({ tenantSlug: "acme", user: { id: "u", email: "e", name: "n" }, expiresIn: 900 }, 201));
    const res = await client.tenant.register({ workspaceName: "A", slug: "acme", adminName: "n", adminEmail: "e", adminPassword: "p", idempotencyKey: "k" });
    expect(res.expiresIn).toBe(900);
    expect(Object.keys(res)).not.toContain("accessToken");
  });

  it("claim-session uses returned claims and skips the backfill", async () => {
    const { client, calls } = await makeClient(() => envelope({ tenantSlug: "acme", session: SESSION, expiresIn: 900 }));
    await client.claimSocialSession("ct");
    expect(calls).toHaveLength(1);
    expect(client.getSessionClaims()).toEqual(SESSION);
  });

  it("branding get/update/public", async () => {
    const branding = { primaryColor: "#112233", fontFamily: "Inter", headerWeight: "bold", backgroundStyle: "solid" };
    const { client, calls } = await makeClient(() => envelope(branding));
    await client.tenant.getBranding();
    await client.tenant.updateBranding({ primaryColor: "#112233" });
    await client.tenant.getPublicBranding("a b");
    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, "")}`)).toEqual([
      "GET /tenants/current/branding",
      "PUT /tenants/current/branding",
      "GET /tenants/a%20b/branding/public",
    ]);
  });

  it("audit list keeps false/0 filters and drops empties; export returns text", async () => {
    const { client, last } = await makeClient((req) =>
      req.url.includes("/export") ? ok("id,type\n1,LOGIN") : envelope({ items: [], nextCursor: null, total: 0 }),
    );
    await client.audit.list({ eventType: "LOGIN", userId: "", limit: 25, cursor: undefined });
    expect(last().url).toBe(`${BASE}/audit?eventType=LOGIN&limit=25`);
    expect(await client.audit.exportCsv({ startDate: "2026-01-01T00:00:00Z" })).toContain("LOGIN");
    const { client: c2 } = await makeClient(() => ok({}));
    expect(await c2.audit.exportCsv()).toBe("");
    const { client: c3 } = await makeClient(() => problem(403, "ACCESS_FORBIDDEN", "No"));
    await expect(c3.audit.exportCsv()).rejects.toMatchObject({ status: 403 });
  });

  it("buildQuery keeps false and 0", () => {
    expect(buildQuery({ a: false, b: 0, c: undefined, d: null, e: "" })).toBe("?a=false&b=0");
    expect(buildQuery({})).toBe("");
  });

  it("saml url builders", async () => {
    const { client } = await makeClient(() => ok({}));
    expect(client.saml.continueUrl("n/1")).toBe(`${BASE}/saml/sso/continue/n%2F1`);
    expect(client.saml.metadataUrl("acme")).toBe(`${BASE}/saml/metadata/acme`);
  });
});

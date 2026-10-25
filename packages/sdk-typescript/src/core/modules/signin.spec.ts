import { describe, expect, it } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";
import { SentryApiError } from "../errors";
import { isMfaChallenge, isMfaEnrollmentRequired, isSessionEstablished } from "../api-types";

const SESSION = { tenantId: "t1", tenantSlug: "acme", groups: ["g"] };

describe("signIn.login", () => {
  it("returns a session and records claims", async () => {
    const { client, last } = await makeClient(() =>
      envelope({ user: { email: "a@b.c", emailVerified: true }, tenantSlug: "acme", session: SESSION, expiresIn: 900 }),
    );
    const out = await client.login({ email: "a@b.c", password: "pw" });
    expect(isSessionEstablished(out)).toBe(true);
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getSessionClaims()).toEqual(SESSION);
    expect(last().url).toBe(`${BASE}/auth/login`);
    expect(last().headers?.["X-Tenant-Slug"]).toBe("acme");
    expect(last().credentials).toBe("include");
  });

  it("returns the MFA challenge branch without establishing a session", async () => {
    const { client } = await makeClient(() =>
      envelope({ mfaRequired: true, tempToken: "tmp", availableMethods: ["totp", "email"], preferredMethod: "totp", message: "m" }),
    );
    const out = await client.login({ email: "a@b.c", password: "pw" });
    expect(isMfaChallenge(out)).toBe(true);
    if (!isMfaChallenge(out)) throw new Error("unreachable");
    expect(out.mfaChallenge).toEqual({ tempToken: "tmp", methods: ["totp", "email"], preferredMethod: "totp" });
    expect(client.isAuthenticated()).toBe(false);
  });

  it("returns the MFA enrollment branch with its token", async () => {
    const { client } = await makeClient(() => envelope({ status: "mfa_enrollment_required", enrollmentToken: "enr" }));
    const out = await client.login({ email: "a@b.c", password: "pw" });
    expect(isMfaEnrollmentRequired(out)).toBe(true);
    expect(out).toMatchObject({ enrollmentToken: "enr" });
    expect(client.isAuthenticated()).toBe(false);
  });

  it("tolerates a non-array methods list", async () => {
    const { client } = await makeClient(() => envelope({ mfaRequired: true, tempToken: "t", availableMethods: "x" }));
    const out = await client.login({ email: "a", password: "b" });
    expect(isMfaChallenge(out) && out.mfaChallenge.methods).toEqual([]);
  });

  it("throws SentryApiError with the problem code and does not try to refresh on bad credentials", async () => {
    const { client, calls } = await makeClient(() => problem(401, "AUTH_INVALID_CREDENTIALS", "Invalid"));
    const err = await client.login({ email: "a", password: "b" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SentryApiError);
    expect((err as SentryApiError).code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(0);
  });

  it("surfaces lockout with retry-after", async () => {
    const { client } = await makeClient(() => problem(429, "RATE_LIMITED", "Slow down", { retryAfterSeconds: 30 }));
    const err = (await client.login({ email: "a", password: "b" }).catch((e: unknown) => e)) as SentryApiError;
    expect(err.retryAfterSeconds).toBe(30);
  });
});

describe("signIn discovery and recovery", () => {
  it("loginIntent posts the email and returns the payload", async () => {
    const intent = { exists: true, email: "a@b.c", methods: { password: true, magicLink: false, passkey: false, mfa: false, social: [] } };
    const { client, last } = await makeClient(() => envelope(intent));
    expect(await client.loginIntent("a@b.c")).toEqual(intent);
    expect(last().body).toEqual({ email: "a@b.c" });
  });

  it("getProviders is a GET", async () => {
    const providers = { password: true, magicLink: true, passkey: false, social: [{ provider: "google", enabled: true }] };
    const { client, last } = await makeClient(() => envelope(providers));
    expect(await client.signIn.getProviders()).toEqual(providers);
    expect(last().method).toBe("GET");
    expect(last().url).toBe(`${BASE}/auth/providers`);
  });

  it("forgot and reset password send bound payloads", async () => {
    const { client, calls } = await makeClient(() => envelope({ message: "ok" }));
    await client.forgotPassword("a@b.c");
    await client.resetPassword("a@b.c", "123456", "NewP@ss1");
    expect(calls[0]?.body).toEqual({ email: "a@b.c" });
    expect(calls[1]?.body).toEqual({ email: "a@b.c", otp: "123456", password: "NewP@ss1" });
  });

  it("reset password rejects an invalid code", async () => {
    const { client } = await makeClient(() => problem(400, "AUTH_OTP_INVALID", "Invalid code"));
    await expect(client.resetPassword("a", "000000", "x")).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
  });
});

describe("signIn MFA completion", () => {
  it("verifyMfaLogin establishes a session", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "ok", tenantSlug: "acme", session: SESSION, expiresIn: 900 }));
    const out = await client.verifyMfaLogin("tmp", "123456");
    expect(out.tenantSlug).toBe("acme");
    expect(client.isAuthenticated()).toBe(true);
    expect(last().url).toBe(`${BASE}/auth/mfa/verify`);
    expect(last().body).toEqual({ tempToken: "tmp", code: "123456" });
  });

  it("verifyMfaBackupLogin returns the low-codes warning", async () => {
    const { client, last } = await makeClient(() => envelope({ tenantSlug: "acme", session: SESSION, expiresIn: 900, warning: "2 codes left" }));
    const out = await client.verifyMfaBackupLogin("tmp", "ABCD-1234");
    expect(out.warning).toBe("2 codes left");
    expect(last().url).toBe(`${BASE}/auth/mfa/verify-backup`);
  });

  it("treats a challenge answering a completed challenge as a protocol error", async () => {
    const { client } = await makeClient(() => envelope({ mfaRequired: true, tempToken: "t" }));
    await expect(client.verifyMfaLogin("t", "1")).rejects.toThrow(/Unexpected non-session/);
  });

  it("maps an invalid code to AUTH_MFA_INVALID", async () => {
    const { client } = await makeClient(() => problem(401, "AUTH_MFA_INVALID", "Bad code"));
    await expect(client.verifyMfaLogin("t", "1")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID", status: 401 });
  });
});

describe("signIn magic link", () => {
  it("send tolerates the doubly-wrapped envelope", async () => {
    const { client, last } = await makeClient(() => ok({ status: 200, data: { status: 200, data: { message: "sent" } } }));
    await client.sendMagicLink("a@b.c");
    expect(last().url).toBe(`${BASE}/auth/magic-link/send`);
  });

  it("verify reads the raw (non-enveloped) session body", async () => {
    const { client } = await makeClient(() => ok({ tenantSlug: "acme", session: SESSION, expiresIn: 900 }));
    const out = await client.verifyMagicLink("tok");
    expect(isSessionEstablished(out)).toBe(true);
    expect(client.getSessionClaims()).toEqual(SESSION);
  });

  it("verify returns the MFA challenge branch", async () => {
    const { client } = await makeClient(() => ok({ mfaRequired: true, tempToken: "t", availableMethods: ["totp"], preferredMethod: "totp" }));
    expect(isMfaChallenge(await client.verifyMagicLink("tok"))).toBe(true);
  });

  it("verify returns the enrollment branch (token delivered by cookie only)", async () => {
    const { client } = await makeClient(() => ok({ status: "mfa_enrollment_required" }));
    const out = await client.verifyMagicLink("tok");
    expect(isMfaEnrollmentRequired(out)).toBe(true);
    expect(out).toMatchObject({ enrollmentToken: undefined });
  });

  it("verify surfaces an expired link as an error", async () => {
    const { client } = await makeClient(() => problem(401, "AUTH_TOKEN_EXPIRED", "Expired"));
    await expect(client.verifyMagicLink("tok")).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" });
  });
});

import { describe, expect, it } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";
import { isSessionEstablished } from "../api-types";
import { isRecentAuthRequired } from "./context";

describe("account registration and verification", () => {
  it("register posts the profile and returns the neutral result", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "Check your email" }, 201));
    const res = await client.account.register({ email: "a@b.c", password: "P@ssw0rd!", firstName: "A" });
    expect(res.message).toBe("Check your email");
    expect(last().url).toBe(`${BASE}/auth/register`);
    expect(last().body).toMatchObject({ email: "a@b.c", firstName: "A" });
  });

  it("register exposes field errors on validation failure", async () => {
    const { client } = await makeClient(() =>
      problem(422, "VALIDATION_FAILED", "Invalid", { errors: [{ field: "password", message: "too weak" }] }),
    );
    const err = await client.account.register({ email: "a", password: "b" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: [{ field: "password", message: "too weak" }] });
  });

  it("verifyEmail and resendVerification", async () => {
    const { client, calls } = await makeClient(() => envelope({ message: "done" }));
    expect(await client.account.verifyEmail("tok")).toEqual({ message: "done" });
    await client.account.resendVerification("a@b.c");
    expect(calls[0]?.body).toEqual({ token: "tok" });
    expect(calls[1]?.url).toBe(`${BASE}/auth/resend-verification`);
  });

  it("verifyEmail surfaces an invalid token", async () => {
    const { client } = await makeClient(() => problem(400, "AUTH_TOKEN_INVALID", "Bad"));
    await expect(client.account.verifyEmail("x")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });

  it("resendVerification surfaces the cooldown", async () => {
    const { client } = await makeClient(() => problem(429, "RATE_LIMITED", "Wait", { retryAfterSeconds: 60 }));
    await expect(client.account.resendVerification("a")).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });
});

describe("account profile and security", () => {
  it("getProfile and updateProfile", async () => {
    const { client, calls } = await makeClient((req) =>
      req.method === "GET" ? envelope({ id: "u1", email: "a@b.c", emailVerified: true }) : envelope({ message: "Profile updated successfully" }),
    );
    expect((await client.account.getProfile()).id).toBe("u1");
    await client.account.updateProfile({ displayName: "Ann" });
    expect(calls[1]).toMatchObject({ method: "PUT", url: `${BASE}/users/me`, body: { displayName: "Ann" } });
  });

  it("changePassword reports recent-auth required so UIs can prompt", async () => {
    const { client } = await makeClient(() => problem(403, "ACCESS_RECENT_AUTH_REQUIRED", "Re-auth", { detail: "Please sign in again" }));
    const err = await client.account.changePassword({ currentPassword: "a", newPassword: "b" }).catch((e: unknown) => e);
    expect(isRecentAuthRequired(err)).toBe(true);
    expect(isRecentAuthRequired(new Error("x"))).toBe(false);
  });

  it("changePassword succeeds", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "Password changed successfully" }));
    await client.account.changePassword({ currentPassword: "a", newPassword: "b" });
    expect(last().url).toBe(`${BASE}/users/me/change-password`);
  });

  it("deleteAccount sends the password and ends the local session", async () => {
    const events: string[] = [];
    const { client, last } = await makeClient(() => envelope({ message: "Account deleted successfully" }));
    client.on((e) => events.push(e.type));
    await client.account.deleteAccount("pw");
    expect(last()).toMatchObject({ method: "DELETE", url: `${BASE}/users/me`, body: { password: "pw" } });
    expect(events).toContain("logout");
    expect(client.isAuthenticated()).toBe(false);
  });

  it("deleteAccount keeps the session when the server refuses", async () => {
    const events: string[] = [];
    const { client } = await makeClient(() => problem(403, "ACCESS_RECENT_AUTH_REQUIRED", "Re-auth"));
    client.on((e) => events.push(e.type));
    await expect(client.account.deleteAccount("pw")).rejects.toBeDefined();
    expect(events).not.toContain("logout");
  });

  it("listSecurityEvents passes the limit", async () => {
    const { client, last } = await makeClient(() => envelope([{ id: "e1", eventType: "LOGIN_SUCCESS", severity: "info", createdAt: "now" }]));
    expect(await client.account.listSecurityEvents(10)).toHaveLength(1);
    expect(last().url).toBe(`${BASE}/users/me/security-events?limit=10`);
    await client.account.listSecurityEvents();
    expect(last().url).toBe(`${BASE}/users/me/security-events`);
  });
});

describe("account.reauthenticate (step-up)", () => {
  const reauthed = envelope({ session: { tenantId: "t", tenantSlug: "acme", groups: [] }, expiresIn: 900 });

  it("a string is a password step-up on the current session", async () => {
    const { client, last } = await makeClient(() => reauthed);
    const out = await client.account.reauthenticate("pw");
    expect(isSessionEstablished(out)).toBe(true);
    expect(out.tenantSlug).toBe("acme");
    expect(last()).toMatchObject({ url: `${BASE}/auth/reauth`, body: { method: "password", password: "pw" } });
    expect(client.getSessionClaims()?.tenantSlug).toBe("acme");
  });

  it("supports totp and webauthn inputs and the webauthn start call", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/reauth/webauthn/start") ? envelope({ challenge: "c", sessionNonce: "n" }) : reauthed,
    );
    await client.account.reauthenticate({ method: "totp", code: "123456" });
    const start = await client.account.startReauthWebAuthn();
    await client.account.reauthenticate({ method: "webauthn", webauthnResponse: { id: "x" }, sessionNonce: start.sessionNonce });
    expect(calls[0]?.body).toEqual({ method: "totp", code: "123456" });
    expect(calls[2]?.body).toMatchObject({ method: "webauthn", sessionNonce: "n" });
  });

  it("rejects with the server error and keeps the session", async () => {
    const { client } = await makeClient(() => problem(401, "AUTH_INVALID_CREDENTIALS", "No"));
    await expect(client.account.reauthenticate("bad")).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("raw body without envelope is also accepted", async () => {
    const { client } = await makeClient(() => ok({ id: "u1", email: "a@b.c", emailVerified: false }));
    expect((await client.account.getProfile()).email).toBe("a@b.c");
  });

  it("verifyEmail returns the redirect and resend forwards it", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "ok", redirectUri: "https://app/x" }));
    expect((await client.account.verifyEmail("t")).redirectUri).toBe("https://app/x");
    await client.account.resendVerification("a@b.c", { redirectUri: "https://app/x" });
    expect(last().body).toEqual({ email: "a@b.c", redirectUri: "https://app/x" });
  });
});

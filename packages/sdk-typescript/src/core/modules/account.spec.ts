import { describe, expect, it } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";
import { isMfaChallenge, isSessionEstablished } from "../api-types";
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
  it("signs in again as the current user and returns the session", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/users/me")
        ? envelope({ id: "u1", email: "a@b.c" })
        : envelope({ tenantSlug: "acme", expiresIn: 900, session: { tenantId: "t", tenantSlug: "acme", groups: [] } }),
    );
    const out = await client.account.reauthenticate("pw");
    expect(isSessionEstablished(out)).toBe(true);
    expect(calls[1]?.body).toEqual({ email: "a@b.c", password: "pw" });
  });

  it("returns the MFA challenge when the account has MFA", async () => {
    const { client } = await makeClient((req) =>
      req.url.endsWith("/users/me") ? envelope({ id: "u1", email: "a@b.c" }) : envelope({ mfaRequired: true, tempToken: "t" }),
    );
    expect(isMfaChallenge(await client.account.reauthenticate("pw"))).toBe(true);
  });

  it("ok() raw body without envelope is also accepted", async () => {
    const { client } = await makeClient(() => ok({ id: "u1", email: "a@b.c", emailVerified: false }));
    expect((await client.account.getProfile()).email).toBe("a@b.c");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";
import { isMfaEnrollmentRequired, isSessionEstablished } from "../api-types";
import type { WebAuthnBrowser } from "./passkeys";

const SESSION = { tenantId: "t", tenantSlug: "acme", groups: [] };

function stubWindow() {
  const win = { location: { href: "", origin: "https://app.test" } };
  vi.stubGlobal("window", win);
  return win;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("social module", () => {
  it("uses the /auth/social paths", async () => {
    const { client, calls } = await makeClient((req) =>
      req.method === "GET"
        ? envelope([{ id: "1", provider: "google", email: "a", displayName: "A", primary: true, createdAt: "x" }])
        : ok(""),
    );
    expect(await client.getSocialConnections()).toHaveLength(1);
    await client.unlinkSocialAccount("google");
    expect(calls.map((c) => c.url.replace(BASE, ""))).toEqual(["/auth/social/connections", "/auth/social/connections/google"]);
  });

  it("accepts the legacy { connections } wrapper and falls back to []", async () => {
    const { client } = await makeClient(() => envelope({ connections: [{ id: "1" }] }));
    expect(await client.social.listConnections()).toHaveLength(1);
    const { client: c2 } = await makeClient(() => envelope({}));
    expect(await c2.social.listConnections()).toEqual([]);
  });

  it("loginUrl and login redirect", async () => {
    const win = stubWindow();
    const { client } = await makeClient(() => ok({}));
    expect(client.social.loginUrl("google")).toBe(`${BASE}/auth/social/google/login?tenant_id=acme`);
    client.initiateSocialLogin("github");
    expect(win.location.href).toBe(`${BASE}/auth/social/github/login?tenant_id=acme&return_url=https%3A%2F%2Fapp.test`);
  });

  it("login is browser-only", async () => {
    const { client } = await makeClient(() => ok({}));
    expect(() => client.social.login("google")).toThrow(/browser/);
  });

  it("startLinking fetches a link token then navigates", async () => {
    const win = stubWindow();
    const { client, last } = await makeClient(() => ok({ status: 200, data: { linkToken: "lt 1" } }));
    await client.initiateSocialLinking("google");
    expect(last().url).toBe(`${BASE}/auth/social/link/token`);
    expect(win.location.href).toBe(`${BASE}/auth/social/link/google?lt=lt%201`);
  });

  it("startLinking fails without a token and outside the browser", async () => {
    stubWindow();
    const { client } = await makeClient(() => envelope({}));
    await expect(client.initiateSocialLinking("google")).rejects.toThrow(/No link token/);
    vi.unstubAllGlobals();
    await expect(client.initiateSocialLinking("google")).rejects.toThrow(/browser/);
  });

  it("unlink surfaces the last-sign-in-method conflict", async () => {
    const { client } = await makeClient(() => problem(409, "RESOURCE_CONFLICT", "Last method"));
    await expect(client.unlinkSocialAccount("google")).rejects.toMatchObject({ status: 409 });
  });
});

describe("passkeys module", () => {
  const lib = (overrides: Partial<WebAuthnBrowser> = {}): WebAuthnBrowser => ({
    startAuthentication: vi.fn(async () => ({ id: "assertion" })),
    startRegistration: vi.fn(async () => ({ id: "attestation" })),
    ...overrides,
  });

  it("authenticate runs start -> browser -> finish and establishes a session", async () => {
    stubWindow();
    const browser = lib();
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/login/start")
        ? envelope({ challenge: "c", sessionNonce: "n1" })
        : ok({ tenantSlug: "acme", session: SESSION, expiresIn: 900 }),
    { webauthn: async () => browser });
    const out = await client.authenticateWithPasskey("a@b.c");
    expect(isSessionEstablished(out)).toBe(true);
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(calls[1]?.body).toEqual({ email: "a@b.c", response: { id: "assertion" }, sessionNonce: "n1" });
  });

  it("finishPasskeyLogin preserves the MFA enrollment branch", async () => {
    const { client } = await makeClient(() => ok({ status: "mfa_enrollment_required" }));
    expect(isMfaEnrollmentRequired(await client.finishPasskeyLogin("a", {}, "n"))).toBe(true);
  });

  it.each([
    ["NotAllowedError", "PASSKEY_AUTH_CANCELLED"],
    ["AbortError", "PASSKEY_AUTH_CANCELLED"],
    ["NotSupportedError", "PASSKEY_NOT_SUPPORTED"],
    ["SecurityError", "PASSKEY_NOT_SUPPORTED"],
  ])("maps %s during authentication to %s", async (name, code) => {
    stubWindow();
    const browser = lib({ startAuthentication: async () => { throw Object.assign(new Error("x"), { name }); } });
    const { client } = await makeClient(() => envelope({ challenge: "c", sessionNonce: "n" }), { webauthn: async () => browser });
    await expect(client.authenticateWithPasskey("a")).rejects.toMatchObject({ code });
  });

  it("rethrows unknown browser errors", async () => {
    stubWindow();
    const browser = lib({ startAuthentication: async () => { throw new TypeError("boom"); } });
    const { client } = await makeClient(() => envelope({ challenge: "c", sessionNonce: "n" }), { webauthn: async () => browser });
    await expect(client.authenticateWithPasskey("a")).rejects.toThrow("boom");
  });

  it("authenticate outside the browser is PASSKEY_NOT_SUPPORTED", async () => {
    const { client } = await makeClient(() => ok({}));
    await expect(client.authenticateWithPasskey("a")).rejects.toMatchObject({ code: "PASSKEY_NOT_SUPPORTED" });
  });

  it("registration runs options -> browser -> finish", async () => {
    stubWindow();
    const browser = lib();
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/register/start") ? envelope({ challenge: "c" }) : envelope({ success: true, credentialId: "cred1" }),
    { webauthn: async () => browser });
    const attestation = await client.startPasskeyRegistration();
    expect(await client.finishPasskeyRegistration(attestation, "Laptop")).toEqual({ credentialId: "cred1" });
    expect(calls[1]?.body).toEqual({ response: { id: "attestation" }, deviceName: "Laptop" });
  });

  it("registration cancel maps to PASSKEY_REGISTRATION_CANCELLED", async () => {
    stubWindow();
    const browser = lib({ startRegistration: async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); } });
    const { client } = await makeClient(() => envelope({ challenge: "c" }), { webauthn: async () => browser });
    await expect(client.startPasskeyRegistration()).rejects.toMatchObject({ code: "PASSKEY_REGISTRATION_CANCELLED" });
  });

  it("registration outside the browser is not supported", async () => {
    const { client } = await makeClient(() => ok({}));
    await expect(client.startPasskeyRegistration()).rejects.toMatchObject({ code: "PASSKEY_NOT_SUPPORTED" });
  });

  it("finishRegistration rejects a response without credentialId", async () => {
    const { client } = await makeClient(() => envelope({ success: true }));
    await expect(client.finishPasskeyRegistration({})).rejects.toThrow(/credentialId/);
  });

  it("list and delete", async () => {
    const { client, calls } = await makeClient((req) =>
      req.method === "GET" ? envelope({ credentials: [{ id: "p1", createdAt: "x", transports: [] }] }) : envelope({ success: true }),
    );
    expect(await client.listPasskeys()).toHaveLength(1);
    await client.deletePasskey("p/1");
    expect(calls[1]?.url).toBe(`${BASE}/mfa/webauthn/credentials/p%2F1`);
  });

  it("list returns [] when the server omits credentials", async () => {
    const { client } = await makeClient(() => envelope({}));
    expect(await client.listPasskeys()).toEqual([]);
  });

  it("surfaces PASSKEY_LIMIT", async () => {
    const { client } = await makeClient(() => problem(409, "PASSKEY_LIMIT", "Limit"));
    await expect(client.finishPasskeyRegistration({})).rejects.toMatchObject({ code: "PASSKEY_LIMIT" });
  });
});

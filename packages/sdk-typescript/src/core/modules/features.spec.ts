import { describe, expect, it } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "../test-utils";

describe("mfa module", () => {
  it("getStatus, setupTotp, confirmTotp", async () => {
    const { client, calls } = await makeClient((req) => {
      if (req.url.endsWith("/status")) return envelope({ enabled: false, methods: [], backupCodesRemaining: 0 });
      if (req.url.endsWith("/setup/totp")) return envelope({ secret: "S", qrCode: "data:", backupCodes: ["A"] });
      return envelope({ message: "TOTP MFA enabled successfully", backupCodes: ["A", "B"] });
    });
    expect((await client.mfa.getStatus()).enabled).toBe(false);
    expect((await client.mfa.setupTotp()).secret).toBe("S");
    expect((await client.mfa.confirmTotp("123456")).backupCodes).toHaveLength(2);
    expect(calls[2]).toMatchObject({ url: `${BASE}/mfa/verify/totp`, body: { token: "123456" } });
  });

  it("confirmTotp surfaces an invalid code", async () => {
    const { client } = await makeClient(() => problem(400, "AUTH_MFA_INVALID", "Invalid code"));
    await expect(client.mfa.confirmTotp("000000")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
  });

  it("disableTotp / disableAll hit the right verbs and surface recent-auth", async () => {
    const { client, calls } = await makeClient(() => envelope({ message: "ok" }));
    await client.mfa.disableTotp();
    await client.mfa.disableAll();
    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, "")}`)).toEqual(["DELETE /mfa/totp", "DELETE /mfa/all"]);
    const { client: c2 } = await makeClient(() => problem(403, "ACCESS_RECENT_AUTH_REQUIRED", "Re-auth"));
    await expect(c2.mfa.disableTotp()).rejects.toMatchObject({ code: "ACCESS_RECENT_AUTH_REQUIRED" });
  });

  it("regenerateBackupCodes and email OTP", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.includes("backup-codes") ? envelope({ backupCodes: ["A"], count: 1 }) : envelope({ message: "sent", expiresIn: "10 minutes" }),
    );
    expect((await client.mfa.regenerateBackupCodes()).count).toBe(1);
    expect((await client.mfa.requestEmailOtp()).expiresIn).toBe("10 minutes");
    await client.mfa.verifyEmailOtp("123456");
    expect(calls[2]?.body).toEqual({ code: "123456" });
  });
});

describe("sessions module", () => {
  const session = { id: "s1", deviceInfo: {}, lastActivity: "x", createdAt: "x", isCurrent: true };

  it("list / revoke / revokeOthers", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/active") ? envelope([session]) : req.url.endsWith("/other") ? envelope({ message: "m", revokedCount: 2 }) : ok(""),
    );
    expect(await client.sessions.list()).toHaveLength(1);
    await client.sessions.revoke("a/b");
    expect((await client.sessions.revokeOthers()).revokedCount).toBe(2);
    expect(calls[1]).toMatchObject({ method: "DELETE", url: `${BASE}/sessions/a%2Fb` });
  });

  it("revokeAll clears the local session", async () => {
    const events: string[] = [];
    const { client } = await makeClient(() => envelope({ message: "m", revokedCount: 3 }));
    client.on((e) => events.push(e.type));
    expect((await client.sessions.revokeAll()).revokedCount).toBe(3);
    expect(events).toContain("logout");
  });

  it("revoke surfaces not found", async () => {
    const { client } = await makeClient(() => problem(404, "RESOURCE_NOT_FOUND", "Gone"));
    await expect(client.sessions.revoke("x")).rejects.toMatchObject({ status: 404 });
  });
});

describe("invites module", () => {
  it("preview encodes the token and is unauthenticated", async () => {
    const { client, last } = await makeClient(() => envelope({ email: "a@b.c", tenantName: "Acme", tenantSlug: "acme" }));
    expect((await client.invites.preview("a b")).tenantSlug).toBe("acme");
    expect(last().url).toBe(`${BASE}/auth/invite/validate/a%20b`);
  });

  it("preview reports an invalid/used/expired invite", async () => {
    const { client } = await makeClient(() => problem(400, "INVITE_INVALID", "Invalid", { detail: "This invitation has expired." }));
    await expect(client.invites.preview("t")).rejects.toMatchObject({ code: "INVITE_INVALID", detail: "This invitation has expired." });
  });

  it("accept posts the form and does not establish a session", async () => {
    const { client, last } = await makeClient(() => envelope({ message: "Account created successfully" }, 201));
    const res = await client.invites.accept({ token: "t", name: "N", password: "P@ssw0rd!" });
    expect(res.message).toMatch(/created/);
    expect(client.isAuthenticated()).toBe(false);
    expect(last().url).toBe(`${BASE}/auth/invite/accept`);
  });

  it("accept surfaces an already-registered email", async () => {
    const { client } = await makeClient(() => problem(409, "RESOURCE_CONFLICT", "Conflict"));
    await expect(client.invites.accept({ token: "t", name: "N", password: "p" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("consent module", () => {
  it("buildAuthorizeUrl drops undefined and forces response_type=code", async () => {
    const { client } = await makeClient(() => ok({}));
    const url = new URL(
      client.consent.buildAuthorizeUrl({ client_id: "c", redirect_uri: "https://app/cb", scope: "openid profile", state: "s", nonce: undefined, max_age: 0 }),
    );
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("max_age")).toBe("0");
    expect(url.searchParams.has("nonce")).toBe(false);
  });

  it("getDetails reads the raw consent body", async () => {
    const details = { transaction_id: "tx", csrf_token: "c", client: { client_id: "c", name: "App" }, scopes: ["openid"] };
    const { client, last } = await makeClient(() => ok(details));
    expect((await client.consent.getDetails("tx")).csrf_token).toBe("c");
    expect(last().url).toBe(`${BASE}/oauth/consent/tx`);
  });

  it("decide maps camelCase to the snake_case DTO and returns redirect_to", async () => {
    const { client, last } = await makeClient(() => ok({ redirect_to: "https://app/cb?code=1" }));
    const res = await client.consent.decide({ transactionId: "tx", csrfToken: "c", decision: "allow", remember: true });
    expect(res.redirect_to).toContain("code=1");
    expect(last().body).toEqual({ transaction_id: "tx", csrf_token: "c", decision: "allow", remember: true });
  });

  it("decide surfaces an expired transaction", async () => {
    const { client } = await makeClient(() => ({ ok: false, status: 400, statusText: "Bad", headers: {}, data: { error: "invalid_request", error_description: "Invalid or expired consent transaction" } }));
    await expect(client.consent.decide({ transactionId: "tx", csrfToken: "c", decision: "deny" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("tenant module", () => {
  it("listMyOrgs returns [] for malformed payloads", async () => {
    const { client } = await makeClient(() => envelope({ not: "array" }));
    expect(await client.getUserOrgs()).toEqual([]);
  });

  it("listMyOrgs returns memberships", async () => {
    const { client } = await makeClient(() => envelope([{ tenantId: "t", slug: "acme", name: "Acme", role: "owner", isGuest: false }]));
    expect(await client.tenant.listMyOrgs()).toHaveLength(1);
  });

  it("checkSlug encodes the slug", async () => {
    const { client, last } = await makeClient(() => envelope({ available: false, reason: "taken" }));
    expect((await client.tenant.checkSlug("a b")).available).toBe(false);
    expect(last().url).toBe(`${BASE}/tenants/slug-check?slug=a%20b`);
  });

  it("register posts the idempotency key", async () => {
    const { client, last } = await makeClient(() => envelope({ tenantSlug: "acme", user: { id: "u", email: "e", name: "n" } }, 201));
    const res = await client.tenant.register({ workspaceName: "Acme", slug: "acme", adminName: "A", adminEmail: "a@b.c", adminPassword: "p", idempotencyKey: "k" });
    expect(res.tenantSlug).toBe("acme");
    expect(last().body).toMatchObject({ idempotencyKey: "k" });
  });
});

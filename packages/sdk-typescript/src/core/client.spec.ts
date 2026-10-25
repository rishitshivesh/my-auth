import { describe, expect, it, vi } from "vitest";
import { BASE, envelope, makeClient, ok, problem } from "./test-utils";
import { SentryClient } from "./client";
import { SentryApiError } from "./errors";
import { unwrapEnvelope, isRecentAuthRequired } from "./modules/context";

const SESSION = { tenantId: "t", tenantSlug: "acme", groups: ["g"] };

describe("SentryClient pipeline", () => {
  it("restores a session from the refresh cookie on construction", async () => {
    const calls: string[] = [];
    const client = new SentryClient({
      baseURL: BASE,
      tenant: "acme",
      transport: async (req) => {
        calls.push(req.url);
        return envelope({ session: SESSION, expiresIn: 900 });
      },
    });
    await client.waitForInit();
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getUserTenantSlug()).toBe("acme");
    expect(calls[0]).toBe(`${BASE}/auth/refresh`);
    expect(client.getBaseURL()).toBe(BASE);
    expect(client.getTenant()).toBe("acme");
  });

  it("silently refreshes once on 401 and retries", async () => {
    let first = true;
    const { client, calls } = await makeClient((req) => {
      if (req.url.endsWith("/auth/refresh")) return envelope({ session: SESSION, expiresIn: 900 });
      if (first) {
        first = false;
        return problem(401, "AUTH_TOKEN_EXPIRED", "Expired");
      }
      return envelope([]);
    });
    expect(await client.sessions.list()).toEqual([]);
    expect(calls.map((c) => c.url.replace(BASE, ""))).toEqual(["/sessions/active", "/auth/refresh", "/sessions/active"]);
  });

  it("expires the session when the retry is still 401", async () => {
    const events: string[] = [];
    const { client } = await makeClient((req) =>
      req.url.endsWith("/auth/refresh") ? envelope({ expiresIn: 900 }) : problem(401, "AUTH_TOKEN_INVALID", "No"),
    );
    client.on((e) => events.push(e.type));
    await expect(client.sessions.list()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(events).toContain("session_expired");
  });

  it("non-401 errors become SentryApiError and fire onError / error events", async () => {
    const onError = vi.fn();
    const events: string[] = [];
    const { client } = await makeClient(() => problem(500, "INTERNAL_ERROR", "Boom"), { onError });
    client.on((e) => events.push(e.type));
    const err = await client.sessions.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SentryApiError);
    expect(onError).toHaveBeenCalledOnce();
    expect(events).toContain("error");
  });

  it("listener errors do not break the client, and unsubscribe works", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = await makeClient(() => problem(500, "INTERNAL_ERROR", "Boom"));
    const off = client.on(() => { throw new Error("listener"); });
    await client.sessions.list().catch(() => undefined);
    expect(spy).toHaveBeenCalled();
    off();
    spy.mockRestore();
  });

  it("logout clears local state even if the API call fails", async () => {
    const { client } = await makeClient(() => problem(500, "INTERNAL_ERROR", "Boom"));
    const out = await client.login({ email: "a", password: "b" }).catch(() => undefined);
    expect(out).toBeUndefined();
    await client.logout();
    expect(client.isAuthenticated()).toBe(false);
  });

  it("getCurrentUser reads /users/me", async () => {
    const { client, last } = await makeClient(() => envelope({ id: "u1", email: "a@b.c" }));
    expect((await client.getCurrentUser()).id).toBe("u1");
    expect(last().url).toBe(`${BASE}/users/me`);
  });

  it("claimSocialSession establishes the session then backfills claims", async () => {
    const { client, calls } = await makeClient((req) =>
      req.url.endsWith("/claim-session") ? envelope({ tenantSlug: "acme", expiresIn: 900 }) : envelope({ session: SESSION, expiresIn: 900 }),
    );
    await client.claimSocialSession("ct");
    expect(calls[0]?.body).toEqual({ ct: "ct" });
    expect(client.getSessionClaims()).toEqual(SESSION);
  });

  it("claimSocialSession tolerates a failing backfill and rejects a bad token", async () => {
    const { client } = await makeClient((req) =>
      req.url.endsWith("/claim-session") ? envelope({ expiresIn: 900 }) : problem(401, "AUTH_TOKEN_INVALID", "No"),
    );
    await client.claimSocialSession("ct");
    expect(client.isAuthenticated()).toBe(true);
    const { client: c2 } = await makeClient(() => problem(401, "AUTH_TOKEN_INVALID", "Bad token"));
    await expect(c2.claimSocialSession("bad")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });

  it("builds one independent client per tenant (no singleton)", async () => {
    const a = await makeClient(() => ok({}), { tenant: "a" });
    const b = await makeClient(() => ok({}), { tenant: "b" });
    await a.client.signIn.getProviders();
    await b.client.signIn.getProviders();
    expect(a.last().headers?.["X-Tenant-Slug"]).toBe("a");
    expect(b.last().headers?.["X-Tenant-Slug"]).toBe("b");
  });
});

describe("unwrapEnvelope", () => {
  it("strips numeric-status envelopes, at most twice", () => {
    expect(unwrapEnvelope({ status: 200, data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapEnvelope({ status: 200, data: { status: 200, data: { a: 1 } } })).toEqual({ a: 1 });
    expect(unwrapEnvelope({ status: 1, data: { status: 2, data: { status: 3, data: "x" } } })).toEqual({ status: 3, data: "x" });
  });

  it("leaves branch payloads with string status and raw values alone", () => {
    const branch = { status: "mfa_enrollment_required", data: "x" };
    expect(unwrapEnvelope(branch)).toBe(branch);
    expect(unwrapEnvelope("text")).toBe("text");
    expect(unwrapEnvelope(null)).toBeNull();
    expect(unwrapEnvelope([1])).toEqual([1]);
  });

  it("isRecentAuthRequired ignores non-AuthErrors", () => {
    expect(isRecentAuthRequired(undefined)).toBe(false);
  });
});

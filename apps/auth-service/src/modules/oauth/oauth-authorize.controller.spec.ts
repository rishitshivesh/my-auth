import { ApiException, ProtocolException } from "@/common/http";
import { OAuthAuthorizeController } from "./oauth-authorize.controller";

jest.mock("@/common/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");
const NOW_S = NOW_MS / 1000;

const client = { id: "cid", clientId: "client_x", clientType: "confidential", requirePkce: false, isFirstParty: false, requireConsent: true, name: "App", postLogoutRedirectUris: ["https://a/bye"] };
const q = { client_id: "client_x", redirect_uri: "https://a/cb", response_type: "code", scope: "openid email", state: "st" } as never;
const session = { userId: "u1", sessionId: "s1", authTime: NOW_S - 10, amr: ["pwd"] };

function setup(opts: { session?: typeof session | null; consentRequired?: boolean } = {}) {
  const clientService = {
    getClient: jest.fn().mockResolvedValue(client),
    validateRedirectUri: jest.fn().mockResolvedValue(true),
    validateGrantType: jest.fn().mockResolvedValue(true),
    validateScopes: jest.fn(async (_c: unknown, s: string[]) => s),
  };
  const tokenService = {
    createAuthorizationCode: jest.fn().mockResolvedValue("CODE"),
    verifyIdTokenHint: jest.fn().mockResolvedValue({ audience: "client_x", subject: "u1", sessionId: "s1" }),
    revokeSessionTokens: jest.fn().mockResolvedValue(undefined),
  };
  const consentService = {
    getConsent: jest.fn().mockResolvedValue(null),
    isConsentRequired: jest.fn().mockResolvedValue(opts.consentRequired ?? false),
    grantConsent: jest.fn().mockResolvedValue({}),
  };
  const browserSessions = { resolve: jest.fn().mockResolvedValue(opts.session === undefined ? session : opts.session) };
  const consentTx = {
    create: jest.fn().mockResolvedValue("TX"),
    peek: jest.fn(),
    consume: jest.fn(),
  };
  const sessionService = { validateSession: jest.fn().mockResolvedValue({ userId: "u1" }), revokeSession: jest.fn().mockResolvedValue(undefined) };
  const events = { log: jest.fn() };
  const config = { getOrThrow: jest.fn(() => "https://login.example.com") };
  const ctl = new OAuthAuthorizeController(
    clientService as never, tokenService as never, consentService as never, browserSessions as never,
    consentTx as never, sessionService as never, events as never, config as never,
  );
  return { ctl, clientService, tokenService, consentService, browserSessions, consentTx, sessionService, events };
}

const req = (over: Record<string, unknown> = {}) =>
  ({ tenantId: "t1", tenant: { slug: "acme" }, ip: "9.9.9.9", get: jest.fn(() => "ua"), cookies: {}, ...over }) as never;
const res = () => ({ redirect: jest.fn(), clearCookie: jest.fn() });
const errorOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ProtocolException);
  return (e as ProtocolException).body.error;
};

describe("OAuthAuthorizeController.authorize", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_MS);
  });
  afterEach(() => jest.useRealTimers());

  it("issues a code bound to session, auth time and amr when consent is not required", async () => {
    const { ctl, tokenService } = setup();
    const r = res();
    await ctl.authorize({ ...(q as object), nonce: "n", code_challenge: "c".repeat(43), code_challenge_method: "S256" } as never, req(), r as never);
    expect(tokenService.createAuthorizationCode).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "t1", clientId: "cid", userId: "u1", sessionId: "s1", authTime: new Date((NOW_S - 10) * 1000), amr: ["pwd"],
      nonce: "n", redirectUri: "https://a/cb", codeChallenge: "c".repeat(43), codeChallengeMethod: "S256",
    }));
    expect(r.redirect).toHaveBeenCalledWith("https://a/cb?code=CODE&state=st");
  });

  it("validates client and redirect_uri before it can redirect anywhere", async () => {
    const { ctl, clientService } = setup({ session: null });
    clientService.validateRedirectUri.mockRejectedValue(new ProtocolException(400, { error: "invalid_request" }));
    const r = res();
    expect(await errorOf(ctl.authorize(q, req(), r as never))).toBe("invalid_request");
    expect(r.redirect).not.toHaveBeenCalled();
  });

  it("maps an unknown client to invalid_request and rethrows other errors", async () => {
    const { ctl, clientService } = setup();
    clientService.getClient.mockRejectedValue(new ApiException("RESOURCE_NOT_FOUND"));
    expect(await errorOf(ctl.authorize(q, req(), res() as never))).toBe("invalid_request");
    clientService.getClient.mockRejectedValue(new Error("db"));
    await expect(ctl.authorize(q, req(), res() as never)).rejects.toThrow("db");
  });

  it("enforces S256 PKCE for public clients and rejects other methods", async () => {
    const { ctl, clientService } = setup();
    clientService.getClient.mockResolvedValue({ ...client, clientType: "public" });
    expect(await errorOf(ctl.authorize(q, req(), res() as never))).toBe("invalid_request");
    expect(await errorOf(ctl.authorize({ ...(q as object), code_challenge: "x", code_challenge_method: "plain" } as never, req(), res() as never))).toBe("invalid_request");
  });

  it("redirects anonymous users to the login UI with a safe relative continue URL", async () => {
    const { ctl, tokenService } = setup({ session: null });
    const r = res();
    await ctl.authorize({ ...(q as object), evil: "https://evil.example.com" } as never, req(), r as never);
    const url = new URL(r.redirect.mock.calls[0][0] as string);
    expect(`${url.origin}${url.pathname}`).toBe("https://login.example.com/u/login");
    expect(url.searchParams.get("tenant")).toBe("acme");
    const cont = url.searchParams.get("continue")!;
    expect(cont.startsWith("/oauth/authorize?")).toBe(true);
    expect(cont).not.toContain("evil");
    expect(new URLSearchParams(cont.split("?")[1]).get("redirect_uri")).toBe("https://a/cb");
    expect(tokenService.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it("prompt=none without a session returns login_required to the redirect_uri with state", async () => {
    const { ctl } = setup({ session: null });
    const r = res();
    await ctl.authorize({ ...(q as object), prompt: "none" } as never, req(), r as never);
    const url = new URL(r.redirect.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://a/cb");
    expect(url.searchParams.get("error")).toBe("login_required");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("rejects prompt=none combined with another value", async () => {
    const { ctl } = setup();
    expect(await errorOf(ctl.authorize({ ...(q as object), prompt: "none login" } as never, req(), res() as never))).toBe("invalid_request");
  });

  it("prompt=login forces login and stamps auth_after; a fresh login satisfies it", async () => {
    const { ctl, browserSessions } = setup();
    const r = res();
    await ctl.authorize({ ...(q as object), prompt: "login" } as never, req(), r as never);
    const cont = new URL(r.redirect.mock.calls[0][0] as string).searchParams.get("continue")!;
    expect(new URLSearchParams(cont.split("?")[1]).get("auth_after")).toBe(String(NOW_S));

    browserSessions.resolve.mockResolvedValue({ ...session, authTime: NOW_S + 1 });
    const r2 = res();
    await ctl.authorize({ ...(q as object), prompt: "login", auth_after: NOW_S } as never, req(), r2 as never);
    expect(r2.redirect.mock.calls[0][0]).toContain("code=CODE");
  });

  it("re-authenticates when the session is older than max_age", async () => {
    const { ctl } = setup();
    const r = res();
    await ctl.authorize({ ...(q as object), max_age: 5 } as never, req(), r as never);
    expect(r.redirect.mock.calls[0][0]).toContain("/u/login");
    const ok = res();
    await ctl.authorize({ ...(q as object), max_age: 60 } as never, req(), ok as never);
    expect(ok.redirect.mock.calls[0][0]).toContain("code=CODE");
  });

  it("sends the user to the consent screen when required, and prompt=none gets consent_required", async () => {
    const { ctl, consentTx, tokenService } = setup({ consentRequired: true });
    const r = res();
    await ctl.authorize(q, req(), r as never);
    expect(consentTx.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", userId: "u1", sessionId: "s1", clientDbId: "cid" }));
    expect(r.redirect.mock.calls[0][0]).toBe("https://login.example.com/u/consent?tenant=acme&transaction_id=TX");
    expect(tokenService.createAuthorizationCode).not.toHaveBeenCalled();

    const none = res();
    await ctl.authorize({ ...(q as object), prompt: "none" } as never, req(), none as never);
    expect(new URL(none.redirect.mock.calls[0][0] as string).searchParams.get("error")).toBe("consent_required");
  });

  it("prompt=consent forces the screen even when consent is already granted", async () => {
    const { ctl, consentTx } = setup({ consentRequired: false });
    const r = res();
    await ctl.authorize({ ...(q as object), prompt: "consent" } as never, req(), r as never);
    expect(consentTx.create).toHaveBeenCalled();
  });
});

describe("OAuthAuthorizeController consent decision", () => {
  const tx = {
    tenantId: "t1", userId: "u1", sessionId: "s1", authTime: NOW_S, amr: ["pwd"], clientDbId: "cid",
    request: { client_id: "client_x", redirect_uri: "https://a/cb", scope: "openid", state: "st" },
    grantedScopes: ["openid"], csrfToken: "csrf",
  };
  const body = { transaction_id: "TX", csrf_token: "csrf", decision: "allow" } as never;

  it("requires a session", async () => {
    const { ctl } = setup({ session: null });
    await expect(ctl.decideConsent(body, req())).rejects.toBeInstanceOf(ApiException);
  });

  it("rejects an unknown, foreign or CSRF-less transaction", async () => {
    const { ctl, consentTx, consentService } = setup();
    consentTx.consume.mockResolvedValue(null);
    expect(await errorOf(ctl.decideConsent(body, req()))).toBe("invalid_request");
    expect(consentTx.consume).toHaveBeenCalledWith("t1", "TX", "u1", "s1", "csrf");
    expect(consentService.grantConsent).not.toHaveBeenCalled();
  });

  it("allow stores consent (remembered or time-boxed) and returns the code redirect", async () => {
    const { ctl, consentTx, consentService, tokenService } = setup();
    consentTx.consume.mockResolvedValue(tx);
    const out = await ctl.decideConsent({ ...(body as object), remember: true } as never, req());
    expect(out.redirect_to).toBe("https://a/cb?code=CODE&state=st");
    expect(consentService.grantConsent).toHaveBeenCalledWith(expect.objectContaining({ rememberConsent: true, expiresInDays: undefined, userId: "u1", clientId: "cid" }));
    expect(tokenService.createAuthorizationCode).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1", userId: "u1" }));

    await ctl.decideConsent(body, req());
    expect(consentService.grantConsent).toHaveBeenLastCalledWith(expect.objectContaining({ rememberConsent: false, expiresInDays: 1 }));
  });

  it("deny returns access_denied with state and issues nothing", async () => {
    const { ctl, consentTx, consentService, tokenService } = setup();
    consentTx.consume.mockResolvedValue(tx);
    const out = await ctl.decideConsent({ ...(body as object), decision: "deny" } as never, req());
    const u = new URL(out.redirect_to);
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("state")).toBe("st");
    expect(consentService.grantConsent).not.toHaveBeenCalled();
    expect(tokenService.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it("consentDetails returns what the screen needs only for the owner's session", async () => {
    const { ctl, consentTx } = setup();
    consentTx.peek.mockResolvedValue(tx);
    const out = await ctl.consentDetails("TX", req());
    expect(out).toMatchObject({ transaction_id: "TX", csrf_token: "csrf", scopes: ["openid"], client: { client_id: "client_x", name: "App" } });
    consentTx.peek.mockResolvedValue(null);
    expect(await errorOf(ctl.consentDetails("TX", req()))).toBe("invalid_request");
  });
});

describe("OAuthAuthorizeController.end_session", () => {
  it("without id_token_hint only redirects to the logout confirmation and ends nothing", async () => {
    const { ctl, sessionService } = setup();
    const r = res();
    await ctl.endSessionGet({} as never, req(), r as never);
    expect(r.redirect).toHaveBeenCalledWith("https://login.example.com/u/logout?tenant=acme");
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(r.clearCookie).not.toHaveBeenCalled();
  });

  it("refuses post_logout_redirect_uri without a hint", async () => {
    const { ctl } = setup();
    expect(await errorOf(ctl.endSessionGet({ post_logout_redirect_uri: "https://a/bye" } as never, req(), res() as never))).toBe("invalid_request");
  });

  it("revokes the hinted session and its OAuth tokens, clears cookies and redirects with state", async () => {
    const { ctl, sessionService, tokenService, events } = setup();
    const r = res();
    await ctl.endSessionGet({ id_token_hint: "jwt", post_logout_redirect_uri: "https://a/bye", state: "x" } as never, req(), r as never);
    expect(sessionService.revokeSession).toHaveBeenCalledWith("t1", "s1", "rp_initiated_logout");
    expect(tokenService.revokeSessionTokens).toHaveBeenCalledWith("t1", "s1", "rp_initiated_logout");
    expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "auth.logout", userId: "u1", resourceId: "s1" }));
    expect(r.clearCookie).toHaveBeenCalledWith("accessToken", expect.any(Object));
    expect(r.redirect).toHaveBeenCalledWith("https://a/bye?state=x");
  });

  it("rejects an unregistered post_logout_redirect_uri and a mismatched client_id without ending anything", async () => {
    const { ctl, sessionService } = setup();
    expect(await errorOf(ctl.endSessionGet({ id_token_hint: "jwt", post_logout_redirect_uri: "https://evil/bye" } as never, req(), res() as never))).toBe("invalid_request");
    expect(await errorOf(ctl.endSessionGet({ id_token_hint: "jwt", client_id: "other" } as never, req(), res() as never))).toBe("invalid_request");
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
  });

  it("never revokes a session that does not belong to the hinted user", async () => {
    const { ctl, sessionService, tokenService } = setup();
    sessionService.validateSession.mockResolvedValue({ userId: "someone-else" });
    await ctl.endSessionGet({ id_token_hint: "jwt" } as never, req(), res() as never);
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(tokenService.revokeSessionTokens).not.toHaveBeenCalled();
  });

  it("also ends the browser's own session when it is the hinted user's, and POST behaves the same", async () => {
    const { ctl, sessionService, browserSessions } = setup();
    browserSessions.resolve.mockResolvedValue({ ...session, sessionId: "s2" });
    const r = res();
    await ctl.endSessionPost({ id_token_hint: "jwt" } as never, req(), r as never);
    expect(sessionService.revokeSession).toHaveBeenCalledWith("t1", "s1", "rp_initiated_logout");
    expect(sessionService.revokeSession).toHaveBeenCalledWith("t1", "s2", "rp_initiated_logout");
    expect(r.redirect).toHaveBeenCalledWith("https://login.example.com/u/logged-out?tenant=acme");
  });
});

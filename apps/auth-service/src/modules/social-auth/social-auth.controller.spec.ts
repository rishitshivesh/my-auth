import { ApiException } from "@/common/http";
import { SocialAuthController } from "./social-auth.controller";
import type { SocialProfile } from "./social-auth.service";
import { issueSocialState, SOCIAL_STATE_COOKIE } from "./social-state";

jest.mock("@/common/http/auth-cookies", () => ({
  setAccessTokenCookie: jest.fn(),
  setMfaEnrollmentCookie: jest.fn(),
  setRefreshTokenCookie: jest.fn(),
  ACCESS_TOKEN_TTL_SECONDS: 900,
}));
import { setAccessTokenCookie, setMfaEnrollmentCookie, setRefreshTokenCookie } from "@/common/http/auth-cookies";

beforeAll(() => { process.env["SESSION_SECRET"] = "unit-test-session-secret-0123456789abcdef"; });
beforeEach(() => jest.clearAllMocks());
const PORTAL = "https://portal.test";
const decodeState = (st: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(st.split(".")[0] ?? "", "base64url").toString());
/** Issues a real signed state plus the matching browser-binding nonce cookie. */
function signed(o: Record<string, string>): { state: string; cookies: Record<string, string> } {
  let nonce = "";
  const scratch = { cookie: (_n: string, v: string) => { nonce = v; } };
  const state = issueSocialState(scratch as never, o);
  return { state, cookies: { [SOCIAL_STATE_COOKIE]: nonce } };
}

function build(env: Record<string, string> = { PORTAL_URL: PORTAL, INTERNAL_GOOGLE_CLIENT_ID: "gid", INTERNAL_GOOGLE_CALLBACK_URL: "https://cb/google", INTERNAL_GITHUB_CLIENT_ID: "ghid", INTERNAL_GITHUB_CALLBACK_URL: "https://cb/gh", INTERNAL_MICROSOFT_CLIENT_ID: "mid", INTERNAL_MICROSOFT_CALLBACK_URL: "https://cb/ms" }) {
  const svc = {
    handleCallback: jest.fn(), verifyLinkToken: jest.fn(), handleLinkCallback: jest.fn(), confirmLinking: jest.fn(),
    createLinkToken: jest.fn(), getUserConnections: jest.fn(), unlinkAccount: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue("CT"), verify: jest.fn() };
  const cfg = { get: (k: string, d?: unknown) => env[k] ?? d };
  const jwks = {
    getCurrentSigningKey: jest.fn().mockResolvedValue({ kid: "k", privateKey: { export: () => "PEM" } }),
    getPublicKeyForToken: jest.fn().mockResolvedValue({ export: () => "PUBPEM" }),
  };
  const res = { redirect: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() };
  return { c: new SocialAuthController(
    svc as never,
    jwt as never,
    cfg as never,
    jwks as never,
    { runInTenant: jest.fn((_slug: string, work: () => Promise<unknown>) => work()) } as never,
    { findById: jest.fn().mockResolvedValue({ id: "t", slug: "acme" }) } as never,
    { drain: jest.fn().mockResolvedValue(undefined) } as never,
  ), svc, jwt, jwks, res: res as never, r: res };
}

const prof = { provider: "google", providerId: "g", email: "a@x.test", accessToken: "at" } as SocialProfile;
const cbReq = (st: Record<string, string> | string | undefined, over: Record<string, unknown> = {}) => {
  const s = typeof st === "object" ? signed(st) : { state: st, cookies: { [SOCIAL_STATE_COOKIE]: "n" } };
  return { user: prof, query: { state: s.state }, cookies: s.cookies, ip: "1.1.1.1", headers: { "user-agent": "ua" }, hostname: "h", ...over };
};

describe("login initiation", () => {
  it("google redirects with client id, callback and encoded state", () => {
    const { c, res, r } = build();
    c.googleLogin({ query: { tenant_id: "t1", return_url: "https://portal.test" } } as never, res);
    const url = new URL(r.redirect.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cb/google");
    expect(decodeState(url.searchParams.get("state")!)).toMatchObject({ tenantId: "t1", returnUrl: "https://portal.test" });
  });

  it("falls back to req.tenantId and empty return url", () => {
    const { c, res, r } = build();
    c.githubLogin({ query: {}, tenantId: "tt" } as never, res);
    const url = new URL(r.redirect.mock.calls[0]?.[0] as string);
    expect(decodeState(url.searchParams.get("state")!)).toMatchObject({ tenantId: "tt", returnUrl: "" });
    c.microsoftLogin({ query: { tenant_id: "x" } } as never, res);
    expect(r.redirect.mock.calls[1]?.[0]).toContain("login.microsoftonline.com/common/");
  });

  it("throws SOCIAL_PROVIDER_DISABLED when provider is not configured", () => {
    const { c, res } = build({});
    let err: unknown;
    try { c.googleLogin({ query: { tenant_id: "t" } } as never, res); } catch (e) { err = e; }
    expect((err as ApiException).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });
});

describe("callback (login mode)", () => {
  const ok = { type: "success", accessToken: "AT", refreshToken: "RT", user: {} };

  it("success: sets refresh cookie, signs 60s completion token, redirects to return url", async () => {
    const { c, svc, jwt, res, r } = build();
    svc.handleCallback.mockResolvedValue(ok);
    await c.googleCallback(cbReq({ tenantId: "t1", returnUrl: "https://portal.test/" }) as never, res);
    expect(setRefreshTokenCookie).toHaveBeenCalledWith(res, "RT");
    expect(jwt.sign).toHaveBeenCalledWith({ accessToken: "AT", type: "social_completion" }, expect.objectContaining({ expiresIn: "60s", algorithm: "RS256", privateKey: "PEM" }));
    expect(r.redirect).toHaveBeenCalledWith("https://portal.test/u/auth/callback?ct=CT");
    expect(svc.handleCallback).toHaveBeenCalledWith({ tenantId: "t1", profile: prof, ipAddress: "1.1.1.1", userAgent: "ua" });
  });

  it("defaults ip and user agent", async () => {
    const { c, svc, res } = build();
    svc.handleCallback.mockResolvedValue(ok);
    await c.githubCallback(cbReq({ tenantId: "t1" }, { ip: undefined, headers: {} }) as never, res);
    expect(svc.handleCallback).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: "0.0.0.0", userAgent: "unknown" }));
  });

  it.each([
    "https://portal.test.evil.io",
    "https://portal.test@evil.io",
    "https://evil.io",
    "javascript:alert(1)",
    "//evil.io",
    "https://user:pw@portal.test",
  ])("open-redirect attempt %s falls back to the configured portal", async (returnUrl) => {
    const { c, svc, res, r } = build();
    svc.handleCallback.mockResolvedValue(ok);
    await c.microsoftCallback(cbReq({ tenantId: "t1", returnUrl }) as never, res);
    expect(r.redirect.mock.calls[0]?.[0]).toBe(`${PORTAL}/u/auth/callback?ct=CT`);
  });

  it("link_required redirects with encoded email", async () => {
    const { c, svc, res, r } = build();
    svc.handleCallback.mockResolvedValue({ type: "link_required", email: "a+b@x.test", provider: "google", message: "m" });
    await c.googleCallback(cbReq({ tenantId: "t1", returnUrl: PORTAL }) as never, res);
    expect(r.redirect).toHaveBeenCalledWith(`${PORTAL}/u/link-required?email=a%2Bb%40x.test&provider=google`);
    expect(setRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it("mfa enrollment sets cookie and redirects, without issuing a session cookie", async () => {
    const { c, svc, res, r } = build();
    svc.handleCallback.mockResolvedValue({ type: "mfa_enrollment_required", enrollmentToken: "E" });
    await c.googleCallback(cbReq({ tenantId: "t1", returnUrl: PORTAL }) as never, res);
    expect(setMfaEnrollmentCookie).toHaveBeenCalledWith(res, "E");
    expect(r.redirect).toHaveBeenCalledWith(`${PORTAL}/mfa/enroll`);
    expect(setRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it("service errors redirect to login with encoded message", async () => {
    const { c, svc, res, r } = build();
    svc.handleCallback.mockRejectedValue(new Error("bad & worse"));
    await c.googleCallback(cbReq({ tenantId: "t1", returnUrl: PORTAL }) as never, res);
    expect(r.redirect).toHaveBeenCalledWith(`${PORTAL}/u/login?error=bad%20%26%20worse`);
    svc.handleCallback.mockRejectedValue("str");
    await c.googleCallback(cbReq({ tenantId: "t1", returnUrl: PORTAL }) as never, res);
    expect(r.redirect).toHaveBeenLastCalledWith(`${PORTAL}/u/login?error=str`);
  });

  it("rejects a state replayed in a different browser (nonce cookie mismatch or absent) and tampered signatures", async () => {
    const { c, svc, res, r } = build();
    const good = signed({ tenantId: "t1", returnUrl: PORTAL });
    await c.googleCallback(cbReq(good.state, { cookies: { [SOCIAL_STATE_COOKIE]: "other-browser" } }) as never, res);
    await c.googleCallback(cbReq(good.state, { cookies: {} }) as never, res);
    const [body, sig] = good.state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...decodeState(good.state), tenantId: "victim" })).toString("base64url");
    await c.googleCallback(cbReq(`${forged}.${sig}`, { cookies: good.cookies }) as never, res);
    await c.googleCallback(cbReq(`${body}.${sig}.extra`, { cookies: good.cookies }) as never, res);
    expect(r.redirect.mock.calls.map((x) => x[0])).toEqual(Array(4).fill("/error?message=Invalid+state+parameter"));
    expect(svc.handleCallback).not.toHaveBeenCalled();
  });

  it("an expired state is rejected", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const { c, svc, res, r } = build();
      const req = cbReq({ tenantId: "t1", returnUrl: PORTAL });
      jest.setSystemTime(new Date("2026-01-01T00:11:00Z"));
      await c.googleCallback(req as never, res);
      expect(r.redirect).toHaveBeenCalledWith("/error?message=Invalid+state+parameter");
      expect(svc.handleCallback).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("invalid / missing state or tenant redirects to /error", async () => {
    const { c, res, r, svc } = build();
    await c.googleCallback(cbReq("!!notbase64json") as never, res);
    await c.googleCallback(cbReq(undefined) as never, res);
    await c.googleCallback(cbReq({ returnUrl: PORTAL }) as never, res);
    expect(r.redirect.mock.calls.map((x) => x[0])).toEqual([
      "/error?message=Invalid+state+parameter", "/error?message=Invalid+state+parameter", "/error?message=Missing+tenant+ID",
    ]);
    expect(svc.handleCallback).not.toHaveBeenCalled();
  });
});

describe("callback (link mode)", () => {
  const linkState = { mode: "link", userId: "u1", tenantId: "t1", lt: "LT" };

  it("verifies link token, links and redirects to admin portal", async () => {
    const { c, svc, res, r } = build();
    svc.verifyLinkToken.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    const req = cbReq(linkState, { user: { ...prof, id: "pid", email: "e@x", displayName: "D", accessToken: "tk", avatar_url: "http://av" } });
    await c.googleCallback(req as never, res);
    expect(svc.verifyLinkToken).toHaveBeenCalledWith("LT");
    expect(svc.handleLinkCallback).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", tenantId: "t1" }));
    expect(r.redirect).toHaveBeenCalledWith("http://localhost:3000/u/auth/callback?mode=link&provider=google");
  });

  it.each([
    ["userId mismatch", { ...linkState, userId: "victim" }],
    ["tenantId mismatch", { ...linkState, tenantId: "other" }],
  ])("%s between client state and signed link token is rejected", async (_n, st) => {
    const { c, svc, res } = build();
    svc.verifyLinkToken.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    await expect(c.googleCallback(cbReq(st) as never, res)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    expect(svc.handleLinkCallback).not.toHaveBeenCalled();
  });

  it("missing lt is verified as empty string and rejected by the service", async () => {
    const { c, svc, res } = build();
    svc.verifyLinkToken.mockRejectedValue(new ApiException("AUTH_TOKEN_INVALID"));
    await expect(c.googleCallback(cbReq({ mode: "link", userId: "u1", tenantId: "t1" }) as never, res)).rejects.toBeInstanceOf(ApiException);
    expect(svc.verifyLinkToken).toHaveBeenCalledWith("");
  });
});

describe("claimSession", () => {
  it("sets access cookie from a valid completion token", async () => {
    const { c, jwt } = build();
    jwt.verify.mockReturnValue({ type: "social_completion", accessToken: "AT", tenantSlug: "acme" });
    const res = {} as never;
    await expect(c.claimSession({ ct: "ct" }, res)).resolves.toEqual({ tenantSlug: "acme", expiresIn: 900 });
    expect(setAccessTokenCookie).toHaveBeenCalledWith(res, "AT");
    expect(jwt.verify).toHaveBeenCalledWith("ct", { publicKey: "PUBPEM", algorithms: ["RS256"] });
  });

  it("defaults tenantSlug to ''", async () => {
    const { c, jwt } = build();
    jwt.verify.mockReturnValue({ type: "social_completion", accessToken: "AT" });
    expect((await c.claimSession({ ct: "ct" }, {} as never)).tenantSlug).toBe("");
  });

  it("rejects a token of another type (e.g. access token replay) and verification failures", async () => {
    const { c, jwt } = build();
    jwt.verify.mockReturnValue({ type: "access", accessToken: "AT" });
    await expect(c.claimSession({ ct: "x" }, {} as never)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    jwt.verify.mockImplementation(() => { throw new Error("expired"); });
    await expect(c.claimSession({ ct: "x" }, {} as never)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });
});

describe("link confirmation and management", () => {
  const OLD = process.env["INTERNAL_PORTAL_URL"];
  afterEach(() => { if (OLD === undefined) delete process.env["INTERNAL_PORTAL_URL"]; else process.env["INTERNAL_PORTAL_URL"] = OLD; });

  it("confirmLinking redirects to success page with message", async () => {
    process.env["INTERNAL_PORTAL_URL"] = "https://portal.test";
    const { c, svc, res, r } = build();
    svc.confirmLinking.mockResolvedValue({ success: true, message: "google account linked successfully" });
    await c.confirmLinking("tok", res);
    expect(r.redirect).toHaveBeenCalledWith("https://portal.test/link-success?message=google+account+linked+successfully");
  });

  it("confirmLinking failure redirects to /error with encoded message", async () => {
    const { c, svc, res, r } = build();
    svc.confirmLinking.mockRejectedValue(new Error("a b"));
    await c.confirmLinking("tok", res);
    expect(r.redirect).toHaveBeenCalledWith("/error?message=a%20b");
    svc.confirmLinking.mockRejectedValue("s");
    await c.confirmLinking("tok", res);
    expect(r.redirect).toHaveBeenLastCalledWith("/error?message=s");
  });

  it("getLinkToken, getConnections, unlinkAccount delegate with request identity", async () => {
    const { c, svc } = build();
    const req = { tenantId: "t1", user: { sub: "u1", userId: "u1" } };
    svc.createLinkToken.mockResolvedValue({ linkToken: "L" });
    expect(await c.getLinkToken(req)).toEqual({ status: 200, data: { linkToken: "L" } });
    await c.getConnections(req);
    await c.unlinkAccount(req, "google");
    expect(svc.getUserConnections).toHaveBeenCalledWith("u1", "t1");
    expect(svc.unlinkAccount).toHaveBeenCalledWith("u1", "t1", "google");
  });

  it.each([["linkGoogle", "accounts.google.com", "gid"], ["linkGithub", "github.com/login/oauth/authorize", "ghid"], ["linkMicrosoft", "login.microsoftonline.com/common", "mid"]] as const)(
    "%s embeds a verified link token in state and redirects to %s", async (method, host, clientId) => {
      const { c, svc, res, r } = build();
      svc.verifyLinkToken.mockResolvedValue({ userId: "u1", tenantId: "t1" });
      await c[method]("LT", res);
      const url = new URL(r.redirect.mock.calls[0]?.[0] as string);
      expect(url.href).toContain(host);
      expect(url.searchParams.get("client_id")).toBe(clientId);
      expect(url.searchParams.get("redirect_uri")).toMatch(/^http:\/\/localhost:3001\/auth\/social\/\w+\/callback$/);
      expect(decodeState(url.searchParams.get("state")!)).toMatchObject({ mode: "link", userId: "u1", tenantId: "t1", lt: "LT" });
    });

  it("link initiation with an invalid token never redirects", async () => {
    const { c, svc, res, r } = build();
    svc.verifyLinkToken.mockRejectedValue(new ApiException("AUTH_TOKEN_INVALID"));
    await expect(c.linkGoogle("bad", res)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    expect(r.redirect).not.toHaveBeenCalled();
  });
});

import { ApiException } from "@/common/http";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

jest.mock("@/common/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const TTL = 900;
const session = { tenantId: "t1", tenantSlug: "acme", groups: [] as string[] };

function build() {
  const svc = {
    register: jest.fn(async (..._a: unknown[]) => ({ message: "ok" })),
    login: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({
      accessToken: "AT",
      refreshToken: "RT",
      tenantSlug: "acme",
      session,
      user: { email: "a@b.c" },
    })),
    logout: jest.fn(async (..._a: unknown[]) => undefined),
    forgotPassword: jest.fn(async (..._a: unknown[]) => undefined),
    resetPassword: jest.fn(async (..._a: unknown[]) => undefined),
    verifyEmail: jest.fn(async (..._a: unknown[]) => undefined),
    resendVerification: jest.fn(async (..._a: unknown[]) => undefined),
    refreshToken: jest.fn(async (..._a: unknown[]) => ({ accessToken: "AT2", refreshToken: "RT2", tenantSlug: "acme", session })),
    getCurrentUser: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown> | null> => ({
      id: "u1", email: "a@b.c", firstName: "A", lastName: "B", emailVerified: true, lastLoginAt: null, lastLoginIp: null, passwordHash: "x",
    })),
    verifyMfa: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ accessToken: "AT", refreshToken: "RT", tenantSlug: "acme", session, message: "m" })),
    verifyMfaBackup: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ accessToken: "AT", refreshToken: "RT", tenantSlug: "acme", session, message: "m", warning: "w" })),
    startWebAuthnLogin: jest.fn(async (..._a: unknown[]) => ({ sessionNonce: "n" })),
    finishWebAuthnLogin: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ accessToken: "AT", refreshToken: "RT", tenantSlug: "acme", session, user: { email: "e" } })),
    sendMagicLink: jest.fn(async (..._a: unknown[]) => undefined),
    verifyMagicLink: jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ accessToken: "AT", refreshToken: "RT", tenantSlug: "acme", session })),
    getProviders: jest.fn(async (..._a: unknown[]) => ({ password: true })),
    getLoginIntent: jest.fn(async (..._a: unknown[]) => ({ exists: true, methods: {}, preferredMethod: "password" })),
    validateInvite: jest.fn(async (..._a: unknown[]) => ({ email: "e" })),
    acceptInvite: jest.fn(async (..._a: unknown[]) => ({ message: "Account created successfully" })),
  };
  return { svc, ctl: new AuthController(svc as unknown as AuthService) };
}

function res() {
  const r = { cookie: jest.fn(), clearCookie: jest.fn(), json: jest.fn() };
  r.json.mockReturnValue(r);
  return r;
}

const req = (o: Record<string, unknown> = {}) => ({ tenantId: "t1", cookies: {}, requestId: "rid", ...o });
const cookieNames = (r: ReturnType<typeof res>) => r.cookie.mock.calls.map((c) => c[0]);

describe("AuthController", () => {
  const asReq = (o?: Record<string, unknown>) => req(o) as never;
  const asRes = (r: ReturnType<typeof res>) => r as never;

  it("register: tenant comes from the resolved request, never the body; defaults UA", async () => {
    const { ctl, svc } = build();
    await ctl.register(asReq(), { email: "e", password: "p", tenantId: "attacker" } as never, "1.1.1.1", undefined as never);
    expect(svc.register).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", ip: "1.1.1.1", userAgent: "unknown" }));
  });

  describe("login", () => {
    it("sets auth cookies and returns no tokens in the body", async () => {
      const { ctl } = build();
      const r = res();
      const out = await ctl.login(asReq(), asRes(r), { email: "e", password: "p" } as never, "ip", "ua");
      expect(cookieNames(r)).toEqual(["accessToken", "refreshToken"]);
      expect(out).toEqual({ user: { email: "a@b.c" }, tenantSlug: "acme", session, expiresIn: TTL });
      expect(JSON.stringify(out)).not.toMatch(/AT|RT"/);
    });

    it("passes MFA / enrollment responses through without cookies", async () => {
      const { ctl, svc } = build();
      svc.login.mockResolvedValue({ mfaRequired: true, tempToken: "tmp" });
      const r = res();
      await expect(ctl.login(asReq(), asRes(r), {} as never, "ip", "")).resolves.toEqual({ mfaRequired: true, tempToken: "tmp" });
      expect(r.cookie).not.toHaveBeenCalled();
      expect(svc.login).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "unknown", tenantId: "t1" }));
    });

    it("propagates credential failures", async () => {
      const { ctl, svc } = build();
      svc.login.mockRejectedValue(new ApiException("AUTH_INVALID_CREDENTIALS"));
      await expect(ctl.login(asReq(), asRes(res()), {} as never, "ip", "ua")).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    });
  });

  it("logout: uses the token's identity, clears cookies", async () => {
    const { ctl, svc } = build();
    const r = res();
    await expect(ctl.logout({ tenantId: "t1", user: { sub: "u1", sessionId: "s1" } }, asRes(r), "ip", "ua")).resolves.toEqual({ message: "Logged out successfully" });
    expect(svc.logout).toHaveBeenCalledWith("t1", "u1", "s1", "ua", "ip");
    expect(r.clearCookie).toHaveBeenCalledTimes(2);
    await ctl.logout({ tenantId: "t1", user: { sub: "u1" } }, asRes(r), "ip", "ua");
    expect(svc.logout).toHaveBeenLastCalledWith("t1", "u1", "", "ua", "ip");
  });

  it("forgotPassword returns a non-enumerating message", async () => {
    const { ctl, svc } = build();
    const out = await ctl.forgotPassword(asReq(), { email: "e" } as never, "ip");
    expect(svc.forgotPassword).toHaveBeenCalledWith("t1", "e", "ip");
    expect(out.message).toMatch(/If an account exists/);
  });

  it("resetPassword forwards request metadata", async () => {
    const { ctl, svc } = build();
    await expect(ctl.resetPassword(asReq(), { email: "e", otp: "123456", password: "pw" } as never, "ip", undefined as never)).resolves.toEqual({ message: "Password reset successfully" });
    expect(svc.resetPassword).toHaveBeenCalledWith("t1", "e", "123456", "pw", "ip", { userAgent: "unknown", requestId: "rid" });
  });

  it("verifyEmail and resendVerification delegate within tenant", async () => {
    const { ctl, svc } = build();
    await expect(ctl.verifyEmail(asReq(), "tok")).resolves.toEqual({ message: "Email verified successfully" });
    await expect(ctl.resendVerification(asReq(), "e")).resolves.toEqual({ message: "Verification email sent" });
    expect(svc.verifyEmail).toHaveBeenCalledWith("t1", "tok");
    expect(svc.resendVerification).toHaveBeenCalledWith("t1", "e");
  });

  describe("refresh", () => {
    it("rejects when the refresh cookie is missing", async () => {
      const { ctl, svc } = build();
      await expect(ctl.refresh(asReq(), asRes(res()), "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      expect(svc.refreshToken).not.toHaveBeenCalled();
    });

    it("rotates cookies and returns no token material", async () => {
      const { ctl, svc } = build();
      const r = res();
      const out = await ctl.refresh(asReq({ cookies: { refreshToken: "old" } }), asRes(r), "ip", "ua");
      expect(svc.refreshToken).toHaveBeenCalledWith("t1", "old", "ip", "ua", "rid");
      expect(r.cookie.mock.calls[0]![1]).toBe("AT2");
      expect(r.cookie.mock.calls[1]![1]).toBe("RT2");
      expect(out).toEqual({ tenantSlug: "acme", session, expiresIn: TTL });
    });
  });

  describe("getCurrentUser", () => {
    const authedReq = (o: Record<string, unknown> = {}) => ({
      tenantId: "t1",
      user: { sub: "u1", tenantId: "t1" },
      tenant: { id: "t1", name: "Acme", slug: "acme", customDomain: "auth.acme.com" },
      sentrySession: { id: "s1", createdAt: "c", lastActivity: "l", expiresAt: "e", ipAddress: "ip", userAgent: "ua", deviceId: "d" },
      ...o,
    });

    it("returns user/tenant/session without secrets and reports tenant match", async () => {
      const { ctl, svc } = build();
      const out = await ctl.getCurrentUser(authedReq());
      expect(svc.getCurrentUser).toHaveBeenCalledWith("t1", "u1");
      expect(out.user).toEqual(expect.objectContaining({ id: "u1", email: "a@b.c" }));
      expect(JSON.stringify(out)).not.toContain("passwordHash");
      expect(out.session).toMatchObject({ id: "s1", deviceId: "d" });
      expect(out.auth).toMatchObject({ tenantMatch: true, tokenTenant: "t1", requestTenant: "t1" });
    });

    it("flags a tenant mismatch and tolerates a missing session", async () => {
      const { ctl } = build();
      const out = await ctl.getCurrentUser(authedReq({ user: { sub: "u1", tenantId: "other" }, sentrySession: undefined }));
      expect(out.auth.tenantMatch).toBe(false);
      expect(out.session).toBeNull();
    });

    it("throws AUTH_SESSION_REVOKED when the user is gone", async () => {
      const { ctl, svc } = build();
      svc.getCurrentUser.mockResolvedValue(null);
      await expect(ctl.getCurrentUser(authedReq())).rejects.toMatchObject({ code: "AUTH_SESSION_REVOKED" });
    });
  });

  describe("MFA verification", () => {
    it("verifyMfa sets cookies and strips tokens from the body", async () => {
      const { ctl, svc } = build();
      const r = res();
      const out = await ctl.verifyMfa(asReq(), asRes(r), { tempToken: "tt", code: "123456" } as never, "ip", "ua");
      expect(svc.verifyMfa).toHaveBeenCalledWith("t1", "tt", "123456", "ip", "ua");
      expect(cookieNames(r)).toEqual(["accessToken", "refreshToken"]);
      expect(out).toEqual({ message: "m", tenantSlug: "acme", session, expiresIn: TTL });
    });

    it("verifyMfa keeps ApiExceptions and masks unexpected errors as AUTH_TOKEN_INVALID", async () => {
      const { ctl, svc } = build();
      svc.verifyMfa.mockRejectedValueOnce(new ApiException("AUTH_MFA_INVALID"));
      await expect(ctl.verifyMfa(asReq(), asRes(res()), {} as never, "ip", "ua")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
      svc.verifyMfa.mockRejectedValueOnce(new Error("db password leak"));
      const err = await ctl.verifyMfa(asReq(), asRes(res()), {} as never, "ip", "ua").catch((e: ApiException) => e);
      expect(err).toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      expect(JSON.stringify(err)).not.toContain("leak");
    });

    it("verifyMfaBackup returns the remaining-codes warning and masks unexpected errors", async () => {
      const { ctl, svc } = build();
      const r = res();
      await expect(ctl.verifyMfaBackup(asReq(), asRes(r), { tempToken: "tt", code: "ABCD-1234" } as never, "ip", "ua")).resolves.toMatchObject({ warning: "w", expiresIn: TTL });
      expect(cookieNames(r)).toEqual(["accessToken", "refreshToken"]);
      svc.verifyMfaBackup.mockRejectedValueOnce(new ApiException("AUTH_TOKEN_EXPIRED"));
      await expect(ctl.verifyMfaBackup(asReq(), asRes(res()), {} as never, "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" });
      svc.verifyMfaBackup.mockRejectedValueOnce("boom");
      await expect(ctl.verifyMfaBackup(asReq(), asRes(res()), {} as never, "ip", "ua")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
    });
  });

  describe("WebAuthn", () => {
    it("start delegates", async () => {
      const { ctl, svc } = build();
      await expect(ctl.startWebAuthnLogin(asReq(), { email: "e" } as never)).resolves.toEqual({ sessionNonce: "n" });
      expect(svc.startWebAuthnLogin).toHaveBeenCalledWith("t1", "e");
    });

    it("finish sets cookies and responds with session metadata only", async () => {
      const { ctl, svc } = build();
      const r = res();
      await ctl.finishWebAuthnLogin(asReq(), asRes(r), { email: "e", response: {}, sessionNonce: "n" } as never, "ip", "ua");
      expect(svc.finishWebAuthnLogin).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", sessionNonce: "n", email: "e" }));
      expect(cookieNames(r)).toEqual(["accessToken", "refreshToken"]);
      expect(r.json).toHaveBeenCalledWith({ user: { email: "e" }, tenantSlug: "acme", session, expiresIn: TTL });
    });

    it("finish sets only the MFA enrollment cookie when enrollment is required", async () => {
      const { ctl, svc } = build();
      svc.finishWebAuthnLogin.mockResolvedValue({ status: "mfa_enrollment_required", enrollmentToken: "et" });
      const r = res();
      await ctl.finishWebAuthnLogin(asReq(), asRes(r), { email: "e", response: {} } as never, "ip", "ua");
      expect(cookieNames(r)).toEqual(["mfa_enrollment_token"]);
      expect(r.json).toHaveBeenCalledWith({ status: "mfa_enrollment_required" });
      expect(JSON.stringify(r.json.mock.calls)).not.toContain("et\"");
    });
  });

  describe("magic link", () => {
    it("send is non-enumerating", async () => {
      const { ctl, svc } = build();
      await expect(ctl.sendMagicLink(asReq(), { email: "e" } as never)).resolves.toMatchObject({ status: 200 });
      expect(svc.sendMagicLink).toHaveBeenCalledWith("t1", "e");
    });

    it("verify sets cookies and defaults the user agent", async () => {
      const { ctl, svc } = build();
      const r = res();
      await ctl.verifyMagicLink(asReq(), asRes(r), { token: "tok" } as never, "ip", "");
      expect(svc.verifyMagicLink).toHaveBeenCalledWith("t1", "tok", "ip", "unknown");
      expect(cookieNames(r)).toEqual(["accessToken", "refreshToken"]);
      expect(r.json).toHaveBeenCalledWith({ tenantSlug: "acme", session, expiresIn: TTL });
    });

    it("verify handles enrollment-required, and MFA challenge responses without cookies for tokens", async () => {
      const { ctl, svc } = build();
      svc.verifyMagicLink.mockResolvedValue({ status: "mfa_enrollment_required", enrollmentToken: "et" });
      const r = res();
      await ctl.verifyMagicLink(asReq(), asRes(r), { token: "t" } as never, "ip", "ua");
      expect(cookieNames(r)).toEqual(["mfa_enrollment_token"]);
      expect(r.json).toHaveBeenCalledWith({ status: "mfa_enrollment_required" });
    });
  });

  describe("getProviders", () => {
    it("prefers the explicit tenant_id query, else the resolved tenant", async () => {
      const { ctl, svc } = build();
      await ctl.getProviders({ tenant_id: "q" } as never, asReq());
      expect(svc.getProviders).toHaveBeenLastCalledWith("q");
      await ctl.getProviders({} as never, asReq());
      expect(svc.getProviders).toHaveBeenLastCalledWith("t1");
    });

    it("fails with TENANT_NOT_FOUND when no tenant can be resolved", async () => {
      const { ctl } = build();
      await expect(ctl.getProviders({} as never, { } as never)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    });
  });

  it("loginIntent uses the resolved tenant", async () => {
    const { ctl, svc } = build();
    await expect(ctl.loginIntent({ email: "e" } as never, { tenantId: "t1", user: { sub: "x" } })).resolves.toMatchObject({ exists: true });
    expect(svc.getLoginIntent).toHaveBeenCalledWith("e", "t1");
  });

  it("invite validate/accept delegate; accept defaults the user agent", async () => {
    const { ctl, svc } = build();
    await expect(ctl.validateInvite("tok")).resolves.toEqual({ email: "e" });
    await ctl.acceptInvite({ token: "t", name: "n", password: "p" } as never, "ip", undefined as never);
    expect(svc.acceptInvite).toHaveBeenCalledWith({ token: "t", name: "n", password: "p", ip: "ip", userAgent: "unknown" });
  });
});

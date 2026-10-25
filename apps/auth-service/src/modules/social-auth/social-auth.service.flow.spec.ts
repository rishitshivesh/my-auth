import { SocialAuthService, type SocialProfile } from "./social-auth.service";

jest.mock("@/common/logger", () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const T = "tenant-1";
const profile = (o: Partial<SocialProfile> = {}): SocialProfile =>
  ({ provider: "google", providerId: "g-1", email: "a@x.test", emailVerified: true, accessToken: "at", refreshToken: "rt", expiresIn: 3600, displayName: "Ann Marie Lee", ...o }) as SocialProfile;

function build() {
  const users = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn(async (v: object) => ({ id: "new-u", ...v })), update: jest.fn() };
  const conns = {
    findOne: jest.fn().mockResolvedValue(null), save: jest.fn(), update: jest.fn(), delete: jest.fn(),
    count: jest.fn(), find: jest.fn(), create: jest.fn((v: object) => v),
  };
  const links = { save: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const events = { log: jest.fn() };
  const enc = { encryptTokens: jest.fn().mockReturnValue({ accessToken: "ENC", refreshToken: "ENCR" }) };
  const sessions = { createSession: jest.fn().mockResolvedValue({ id: "s1" }) };
  const refresh = { createRefreshToken: jest.fn().mockResolvedValue({ token: "RT" }) };
  const jwt = { sign: jest.fn().mockReturnValue("JWT"), verify: jest.fn() };
  const jwks = { getCurrentSigningKey: jest.fn().mockResolvedValue({ kid: "k1", privateKey: "PK" }), getPublicKeyForToken: jest.fn().mockResolvedValue("PUB") };
  const userRoles = { find: jest.fn().mockResolvedValue([]) };
  const mfaPolicy = { getForTenant: jest.fn().mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: false }), issueEnrollmentToken: jest.fn().mockResolvedValue("ENROLL") };
  const mfa = { getMfaStatus: jest.fn().mockResolvedValue({ enabled: true }) };
  const email = { sendAccountLinkRequest: jest.fn() };
  const service = new SocialAuthService(
    users as never, conns as never, {} as never, links as never, events as never, enc as never, sessions as never,
    refresh as never, jwt as never, {} as never, jwks as never, userRoles as never, mfaPolicy as never, mfa as never, email as never,
  );
  return { service, users, conns, links, events, enc, sessions, refresh, jwt, jwks, userRoles, mfaPolicy, mfa, email };
}

const baseUser = { id: "u1", email: "a@x.test", firstName: "A", lastName: "L", displayName: "AL", avatarUrl: null, emailVerified: true };
const conn = { id: "c1", tenantId: T, user: baseUser };
const ctx = { ipAddress: "1.2.3.4", userAgent: "ua" };

describe("handleCallback: existing social connection", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("logs in: encrypts refreshed tokens, creates session, signs RS256 15m token with tenant key", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(res).toMatchObject({ type: "success", accessToken: "JWT", refreshToken: "RT", user: { id: "u1", avatarUrl: undefined } });
    expect(fx.conns.update).toHaveBeenCalledWith("c1", expect.objectContaining({
      accessToken: "ENC", refreshToken: "ENCR", tokenExpiresAt: new Date("2026-01-01T01:00:00Z"), lastUsedAt: new Date(),
    }));
    expect(fx.jwks.getCurrentSigningKey).toHaveBeenCalledWith(T);
    expect(fx.jwt.sign).toHaveBeenCalledWith(
      { sub: "u1", email: "a@x.test", tenantId: T, sessionId: "s1", authTime: expect.any(Number), amr: ["social"] },
      expect.objectContaining({ algorithm: "RS256", expiresIn: "15m", header: { alg: "RS256", kid: "k1" } }),
    );
    expect(fx.users.update).toHaveBeenCalledWith("u1", { lastLoginAt: new Date(), lastLoginIp: "1.2.3.4" });
    expect(fx.events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "social.login_success" as never, userId: "u1" }));
  });

  it("omits tokenExpiresAt when the provider gave no expiry, falls back to profile avatar", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile({ expiresIn: undefined, avatarUrl: "http://av" }), ...ctx });
    expect(fx.conns.update.mock.calls[0]?.[1].tokenExpiresAt).toBeUndefined();
    expect(res).toMatchObject({ user: { avatarUrl: "http://av" } });
  });

  it("MFA enrolled: no enrollment check, session issued", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(fx.mfaPolicy.getForTenant).not.toHaveBeenCalled();
  });

  it("enforceForAllUsers without MFA -> enrollment token and NO session", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    fx.mfa.getMfaStatus.mockResolvedValue({ enabled: false });
    fx.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: true, enforceForAdmins: false });
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(res).toEqual({ type: "mfa_enrollment_required", enrollmentToken: "ENROLL" });
    expect(fx.sessions.createSession).not.toHaveBeenCalled();
    expect(fx.refresh.createRefreshToken).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", true], ["OWNER", true], ["member", false],
  ])("enforceForAdmins: role %s -> enrollment=%s", async (role, enroll) => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    fx.mfa.getMfaStatus.mockResolvedValue({ enabled: false });
    fx.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
    fx.userRoles.find.mockResolvedValue([{ role: { name: role } }]);
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(res.type).toBe(enroll ? "mfa_enrollment_required" : "success");
  });

  it("enforceForAdmins with role missing name does not force enrollment", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    fx.mfa.getMfaStatus.mockResolvedValue({ enabled: false });
    fx.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
    fx.userRoles.find.mockResolvedValue([{ role: undefined }]);
    expect((await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx })).type).toBe("success");
  });

  it("no MFA policy -> session issued", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue(conn);
    fx.mfa.getMfaStatus.mockResolvedValue({ enabled: false });
    expect((await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx })).type).toBe("success");
  });

  it("looks the connection up by tenant+provider+providerId (no cross-tenant reuse)", async () => {
    const fx = build();
    await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(fx.conns.findOne).toHaveBeenCalledWith({ where: { tenantId: T, provider: "google", providerId: "g-1" }, relations: ["user"] });
  });

  it("refuses login for a deactivated user", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue({ ...conn, user: { ...baseUser, isActive: false, status: "suspended" } });
    await expect(fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx })).rejects.toMatchObject({ code: "USER_SUSPENDED" });
    expect(fx.sessions.createSession).not.toHaveBeenCalled();
    expect(fx.conns.update).not.toHaveBeenCalled();
  });
});

describe("handleCallback: new user creation", () => {
  it("creates user, connection, session and tokens; splits displayName", async () => {
    const fx = build();
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(fx.users.save).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: T, email: "a@x.test", emailVerified: true, firstName: "Ann", lastName: "Marie Lee",
      primaryAuthMethod: "google", passwordHash: undefined, status: "active",
    }));
    expect(fx.conns.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: "new-u", providerId: "g-1", accessToken: "ENC", primary: true, tenantId: T,
    }));
    expect(res).toMatchObject({ type: "success", accessToken: "JWT", refreshToken: "RT" });
    expect(fx.events.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: T, resourceId: "s1" }));
  });

  it("prefers explicit first/last name and defaults emailVerified to true when unspecified", async () => {
    const fx = build();
    await fx.service.handleCallback({ tenantId: T, profile: profile({ firstName: "F", lastName: "L", emailVerified: undefined }), ...ctx });
    expect(fx.users.save).toHaveBeenCalledWith(expect.objectContaining({ firstName: "F", lastName: "L", emailVerified: true }));
  });

  it("handles profiles with no names", async () => {
    const fx = build();
    await fx.service.handleCallback({ tenantId: T, profile: profile({ displayName: undefined }), ...ctx });
    expect(fx.users.save).toHaveBeenCalledWith(expect.objectContaining({ firstName: undefined, lastName: undefined }));
  });

  it("persists encrypted tokens only, never plaintext", async () => {
    const fx = build();
    await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(JSON.stringify(fx.conns.save.mock.calls)).not.toContain('"at"');
    expect(JSON.stringify(fx.conns.save.mock.calls)).not.toContain('"rt"');
  });

  it("applies tenant MFA enforcement to freshly created social users", async () => {
    const fx = build();
    fx.mfa.getMfaStatus.mockResolvedValue({ enabled: false });
    fx.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: true, enforceForAdmins: false });
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(res.type).toBe("mfa_enrollment_required");
  });
});

describe("handleCallback: existing email -> link request", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("stores encrypted tokens with 1h expiry and a 256-bit token, emails the owner", async () => {
    const fx = build();
    const existing = { id: "u1", tenantId: T, email: "a@x.test" };
    fx.users.findOne.mockResolvedValue(existing);
    const res = await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(res).toMatchObject({ type: "link_required", provider: "google", email: "a@x.test" });
    const saved = fx.links.save.mock.calls[0]?.[0];
    expect(saved.token).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.expiresAt).toEqual(new Date("2026-01-01T01:00:00Z"));
    expect(saved.profileData).toMatchObject({ accessToken: "ENC", refreshToken: "ENCR" });
    expect(fx.email.sendAccountLinkRequest).toHaveBeenCalledWith({ user: existing, provider: "google", token: saved.token });
    expect(fx.conns.save).not.toHaveBeenCalled();
  });

  it("generates a distinct token per request", async () => {
    const fx = build();
    fx.users.findOne.mockResolvedValue({ id: "u1", tenantId: T });
    await fx.service.handleCallback({ tenantId: T, profile: profile({ expiresIn: undefined }), ...ctx });
    await fx.service.handleCallback({ tenantId: T, profile: profile(), ...ctx });
    expect(fx.links.save.mock.calls[0]?.[0].token).not.toBe(fx.links.save.mock.calls[1]?.[0].token);
    expect(fx.links.save.mock.calls[0]?.[0].profileData.tokenExpiresAt).toBeUndefined();
  });
});

describe("confirmLinking", () => {
  const req = (over: Record<string, unknown> = {}) => ({
    id: "lr", tenantId: T, userId: "u1", provider: "google", providerId: "g-1", providerEmail: "a@x.test",
    isExpired: false, ipAddress: null, userAgent: null, user: { emailVerified: true },
    profileData: { accessToken: "ENC", refreshToken: "R", displayName: "D" }, ...over,
  });

  it("only looks up incomplete requests (single use)", async () => {
    const fx = build();
    fx.links.findOne.mockResolvedValue(null);
    await expect(fx.service.confirmLinking("t")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    expect(fx.links.findOne).toHaveBeenCalledWith({ where: { token: "t", completed: false }, relations: ["user"] });
  });

  it("rejects expired requests without creating a connection", async () => {
    const fx = build();
    fx.links.findOne.mockResolvedValue(req({ isExpired: true }));
    await expect(fx.service.confirmLinking("t")).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" });
    expect(fx.conns.save).not.toHaveBeenCalled();
  });

  it("creates non-primary connection, completes the request, logs event with empty ip fallbacks", async () => {
    const fx = build();
    fx.links.findOne.mockResolvedValue(req());
    const res = await fx.service.confirmLinking("t");
    expect(res).toEqual({ success: true, message: "google account linked successfully" });
    expect(fx.conns.save).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", primary: false, accessToken: "ENC" }));
    expect(fx.links.update).toHaveBeenCalledWith("lr", expect.objectContaining({ completed: true }));
    expect(fx.events.log).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: "", userAgent: "", metadata: { provider: "google", reclaimedUnverified: false } }));
  });

  it("treats a missing user relation as verified (no password drop)", async () => {
    const fx = build();
    fx.links.findOne.mockResolvedValue(req({ user: undefined }));
    await fx.service.confirmLinking("t");
    expect(fx.users.update).not.toHaveBeenCalled();
  });

  it("password-drop expression resolves to SQL NULL", async () => {
    const fx = build();
    fx.links.findOne.mockResolvedValue(req({ user: { emailVerified: false } }));
    await fx.service.confirmLinking("t");
    const arg = fx.users.update.mock.calls[0]?.[1] as { passwordHash: () => string };
    expect(arg.passwordHash()).toBe("NULL");
  });
});

describe("unlinkAccount", () => {
  it("404 when the connection is absent", async () => {
    const fx = build();
    await expect(fx.service.unlinkAccount("u1", T, "google")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("refuses to unlink the last sign-in method (no password, one connection)", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue({ id: "c1" });
    fx.users.findOne.mockResolvedValue({ passwordHash: null });
    fx.conns.count.mockResolvedValue(1);
    await expect(fx.service.unlinkAccount("u1", T, "google")).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(fx.conns.delete).not.toHaveBeenCalled();
  });

  it("also refuses when the user row is missing and one connection remains", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue({ id: "c1" });
    fx.users.findOne.mockResolvedValue(null);
    fx.conns.count.mockResolvedValue(1);
    await expect(fx.service.unlinkAccount("u1", T, "google")).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
  });

  it.each([[{ passwordHash: "h" }, 1], [{ passwordHash: null }, 2]])("allows unlink when user=%j and connections=%i", async (user, count) => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue({ id: "c1" });
    fx.users.findOne.mockResolvedValue(user);
    fx.conns.count.mockResolvedValue(count);
    await expect(fx.service.unlinkAccount("u1", T, "github")).resolves.toEqual({ success: true, message: "github account unlinked successfully" });
    expect(fx.conns.delete).toHaveBeenCalledWith("c1");
    expect(fx.events.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { provider: "github" } }));
  });
});

describe("connections list, link tokens", () => {
  it("getUserConnections never selects token columns", async () => {
    const fx = build();
    fx.conns.find.mockResolvedValue([]);
    await fx.service.getUserConnections("u1", T);
    const sel = fx.conns.find.mock.calls[0]?.[0].select as string[];
    expect(sel).not.toContain("accessToken");
    expect(sel).not.toContain("refreshToken");
  });

  it("createLinkToken signs a 60s link-mode token for the tenant", async () => {
    const fx = build();
    await expect(fx.service.createLinkToken("u1", T)).resolves.toEqual({ linkToken: "JWT" });
    expect(fx.jwt.sign).toHaveBeenCalledWith({ userId: "u1", tenantId: T, mode: "link" }, expect.objectContaining({ expiresIn: "60s", algorithm: "RS256" }));
  });

  it("verifyLinkToken accepts a valid link token and pins RS256", async () => {
    const fx = build();
    fx.jwt.verify.mockReturnValue({ userId: "u1", tenantId: T, mode: "link" });
    await expect(fx.service.verifyLinkToken("tok")).resolves.toEqual({ userId: "u1", tenantId: T });
    expect(fx.jwt.verify).toHaveBeenCalledWith("tok", { publicKey: "PUB", algorithms: ["RS256"] });
  });

  it.each([
    ["wrong mode (access token replay)", { userId: "u", tenantId: T, mode: "access" }],
    ["missing mode", { userId: "u", tenantId: T }],
    ["missing userId", { tenantId: T, mode: "link" }],
    ["missing tenantId", { userId: "u", mode: "link" }],
  ])("verifyLinkToken rejects %s", async (_n, payload) => {
    const fx = build();
    fx.jwt.verify.mockReturnValue(payload);
    await expect(fx.service.verifyLinkToken("tok")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });

  it("verifyLinkToken maps signature/expiry/key-lookup failures to AUTH_TOKEN_INVALID", async () => {
    const fx = build();
    fx.jwt.verify.mockImplementation(() => { throw new Error("jwt expired"); });
    await expect(fx.service.verifyLinkToken("tok")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    fx.jwks.getPublicKeyForToken.mockRejectedValue(new Error("no key"));
    await expect(fx.service.verifyLinkToken("tok")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });
});

describe("handleLinkCallback", () => {
  it("is idempotent when already linked to this user", async () => {
    const fx = build();
    fx.conns.findOne.mockResolvedValue({ id: "c", userId: "u1" });
    await expect(fx.service.handleLinkCallback({ userId: "u1", tenantId: T, profile: profile() })).resolves.toEqual({ provider: "google" });
    expect(fx.conns.save).not.toHaveBeenCalled();
  });

  it("404 when user not found in tenant", async () => {
    const fx = build();
    await expect(fx.service.handleLinkCallback({ userId: "u1", tenantId: T, profile: profile() })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("creates a non-primary connection", async () => {
    const fx = build();
    fx.users.findOne.mockResolvedValue({ id: "u1" });
    await fx.service.handleLinkCallback({ userId: "u1", tenantId: T, profile: profile() });
    expect(fx.conns.save).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", providerId: "g-1", primary: false }));
  });

  it("refuses to link a provider identity already bound to a different user", async () => {
    const fx = build();
    fx.conns.findOne.mockImplementation(({ where }: { where: { userId?: string } }) =>
      Promise.resolve(where.userId === undefined ? { id: "c", userId: "someone-else" } : null));
    fx.users.findOne.mockResolvedValue({ id: "u1" });
    await expect(fx.service.handleLinkCallback({ userId: "u1", tenantId: T, profile: profile() })).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(fx.conns.save).not.toHaveBeenCalled();
  });
});

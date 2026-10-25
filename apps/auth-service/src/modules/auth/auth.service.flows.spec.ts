import { coarseUserAgent } from "./auth.service";
import { LinkTokenService } from "@/common/service/link-token.service";
import * as crypto from "crypto";
import { createHash } from "crypto";
import { HttpException } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { DomainEventName } from "@/common/service/domain-events.service";
import { SecurityEventType } from "@repo/database";
import { AuthService } from "./auth.service";
import { verifyPassword } from "./password-hashing";

jest.mock("./password-hashing", () => ({
  hashPassword: jest.fn(async () => "new-hash"),
  verifyPassword: jest.fn(),
  verifyAgainstDummy: jest.fn(async () => false),
}));
jest.mock("crypto", () => {
  const actual = jest.requireActual<typeof import("crypto")>("crypto");
  return { ...actual, randomInt: jest.fn(actual.randomInt), timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});
jest.mock("@/common/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const verify = verifyPassword as jest.Mock;
const NOW = new Date("2026-07-01T12:00:00Z");
const T = "tenant-1";
const STRONG = "Tr0ub4dor-Horse-Staple";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type AnyFn = jest.Mock;

function qb(result: unknown) {
  const b = {
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => result),
  };
  return b;
}

const baseUser = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ann@example.com",
  tenantId: T,
  firstName: "Ann",
  lastName: "Lee",
  passwordHash: "stored",
  emailVerified: true,
  isActive: true,
  tenant: { id: T, slug: "acme", name: "Acme", featureFlags: {} },
  ...o,
});

function build(user: Record<string, unknown> | null = baseUser(), redisImpl?: Record<string, unknown>) {
  const builder = qb(user);
  const userRepo = {
    createQueryBuilder: jest.fn(() => builder),
    findOne: jest.fn(async (..._a: unknown[]) => user),
    create: jest.fn((v: object) => ({ ...v })),
    save: jest.fn(async (v: object) => ({ id: "new-user", ...v })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const sessionRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
  const tenantRepo = {
    findOne: jest.fn(async () => ({ id: T, slug: "acme", active: true, settings: {}, featureFlags: {}, branding: { logo: "x" } })),
  };
  const refreshRepo = { findOne: jest.fn() };
  const socialConnRepo = { find: jest.fn(async () => [] as Array<{ provider: string }>) };
  const userRoleRepo = {
    find: jest.fn(async () => [] as Array<{ role?: { name: string } }>),
    create: jest.fn((v: object) => v),
    save: jest.fn(),
  };
  const inviteRepo = { findOne: jest.fn(), update: jest.fn() };
  const providerRepo = { find: jest.fn(async () => [] as Array<{ provider: string; enabled: boolean }>) };
  const jwt = { sign: jest.fn((..._a: unknown[]) => "signed"), verify: jest.fn() };
  const email = {
    sendWelcomeEmail: jest.fn(),
    sendPasswordResetOtpEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendMagicLinkEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };
  const sessionService = { createSession: jest.fn(async (..._a: unknown[]) => ({ id: "sess-1" })) };
  const brute = {
    clearExpiredLock: jest.fn(),
    checkAccountLock: jest.fn(),
    isLocked: jest.fn(() => false),
    recordFailedAttempt: jest.fn(async () => {
      throw new ApiException("AUTH_INVALID_CREDENTIALS");
    }),
    resetFailedAttempts: jest.fn(),
  };
  const mfa = {
    getMfaStatus: jest.fn(async () => ({ enabled: false, methods: [], backupCodesRemaining: 8 }) as Record<string, unknown>),
    verifyTotp: jest.fn(async () => true),
    verifyBackupCode: jest.fn(async () => true),
  };
  const mfaPolicy = {
    getForTenant: jest.fn(async () => ({ enforceForAllUsers: false, enforceForAdmins: false })),
    issueEnrollmentToken: jest.fn(async () => "enroll-token"),
  };
  const webauthn = {
    startAuthentication: jest.fn(async () => ({ options: { challenge: "c" }, sessionNonce: "n1" })),
    finishAuthentication: jest.fn(async () => true),
  };
  const oauthRefresh = {
    createRefreshToken: jest.fn(async () => ({ token: "refresh-1" })),
    rotateRefreshToken: jest.fn(),
    revokeSessionTokens: jest.fn(),
  };
  const events = { log: jest.fn() };
  const jwks = {
    getCurrentSigningKey: jest.fn(async () => ({ kid: "k1", privateKey: { export: () => "PEM" } })),
    getPublicKeyForToken: jest.fn(async () => ({ export: () => "PUBPEM" })),
  };
  const redis = {
    incr: jest.fn(async () => 1),
    extendTTL: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(async () => null),
    set: jest.fn(),
    setIfAbsent: jest.fn(async () => true),
  };
  const throttle = { charge: jest.fn(async () => ({ blocked: false })), refund: jest.fn() };
  const domainEvents = { publish: jest.fn() };
  const effects = { afterPasswordChange: jest.fn() };

  const store = new Map<string, unknown>();
  const k = (...p: string[]) => p.join("|");
  const linkRedis = {
    set: jest.fn(async (t: string, r: string, i: string, v: unknown) => { store.set(k(t, r, i), v); }),
    get: jest.fn(async (t: string, r: string, i: string) => store.get(k(t, r, i)) ?? null),
    delete: jest.fn(async (t: string, r: string, i: string) => { store.delete(k(t, r, i)); }),
    setIfAbsent: jest.fn(async (t: string, r: string, i: string, v: unknown) => {
      if (store.has(k(t, r, i))) return false;
      store.set(k(t, r, i), v);
      return true;
    }),
  };
  const linkTokens = new LinkTokenService((redisImpl ?? linkRedis) as never);

  const service = new AuthService(
    userRepo as never,
    sessionRepo as never,
    tenantRepo as never,
    refreshRepo as never,
    socialConnRepo as never,
    userRoleRepo as never,
    inviteRepo as never,
    providerRepo as never,
    jwt as never,
    {} as never,
    email as never,
    sessionService as never,
    brute as never,
    mfa as never,
    mfaPolicy as never,
    webauthn as never,
    oauthRefresh as never,
    events as never,
    jwks as never,
    (redisImpl ?? redis) as never,
    throttle as never,
    domainEvents as never,
    effects as never,
    undefined,
    linkTokens,
  );
  return {
    service, linkTokens, builder, userRepo, sessionRepo, tenantRepo, refreshRepo, socialConnRepo, userRoleRepo, inviteRepo,
    providerRepo, jwt, email, sessionService, brute, mfa, mfaPolicy, webauthn, oauthRefresh, events, jwks, redis,
    throttle, domainEvents, effects,
  };
}

const eventTypes = (h: { events: { log: AnyFn } }) =>
  h.events.log.mock.calls.map((c) => (c[0] as { eventType: string }).eventType);

const sha256Hex = (v: string): string => createHash("sha256").update(v).digest("hex");

describe("AuthService flows", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    verify.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  // ------------------------------------------------------------------ register
  describe("register", () => {
    const data = { tenantId: T, email: "new@example.com", password: STRONG, firstName: "N", lastName: "U", ip: "1.1.1.1", userAgent: "ua" };

    it("rejects an unknown/inactive tenant", async () => {
      const h = build(null);
      h.tenantRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.register(data)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
      expect(h.tenantRepo.findOne).toHaveBeenCalledWith({ where: { id: T, active: true } });
    });

    it("rejects weak passwords before hashing/lookup", async () => {
      const h = build(null);
      await expect(h.service.register({ ...data, password: "short" })).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
      expect(h.userRepo.findOne).not.toHaveBeenCalled();
    });

    it("creates a tenant-scoped unverified user with a 24h hex token and sends the welcome mail", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      const res = await h.service.register(data);
      const created = h.userRepo.create.mock.calls[0]![0] as Record<string, unknown>;
      expect(created).toMatchObject({ tenantId: T, email: "new@example.com", passwordHash: "new-hash" });
      expect(created.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);
      expect(created.emailVerificationExpiresAt).toEqual(new Date(NOW.getTime() + 24 * 3600_000));
      const rawToken = h.email.sendWelcomeEmail.mock.calls[0]![1] as string;
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(created.emailVerificationToken).toBe(sha256Hex(rawToken)); // only the digest is stored
      expect(eventTypes(h)).toEqual([SecurityEventType.USER_REGISTERED]);
      expect(res.message).toContain("check your email");
    });

    it("answers identically for a taken email, logs REGISTRATION_FAILED and sends no mail", async () => {
      const h = build(baseUser({ id: "existing" }));
      const taken = await h.service.register(data);
      const fresh = await build(null).service.register(data);
      expect(taken).toEqual(fresh);
      expect(eventTypes(h)).toEqual([SecurityEventType.REGISTRATION_FAILED]);
      expect(h.userRepo.save).not.toHaveBeenCalled();
      expect(h.email.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------- login
  describe("login (success paths)", () => {
    const creds = { tenantId: T, email: "ann@example.com", password: "pw", ip: "1.1.1.1", userAgent: "ua", deviceId: "dev" };

    beforeEach(() => verify.mockResolvedValue(true));

    it("issues a session, refresh and RS256 access token with kid, and logs LOGIN_SUCCESS", async () => {
      const h = build();
      h.userRoleRepo.find.mockResolvedValue([{ role: { name: "editor" } }]);
      const out = await h.service.login(creds);
      expect(out).toMatchObject({
        accessToken: "signed",
        refreshToken: "refresh-1",
        tenantSlug: "acme",
        session: { tenantId: T, tenantSlug: "acme", groups: ["editor"] },
        user: { email: "ann@example.com", firstName: "Ann", lastName: "Lee", emailVerified: true },
      });
      expect(h.sessionService.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", tenantId: T, deviceId: "dev", amr: ["pwd"] }));
      expect(h.oauthRefresh.createRefreshToken).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-1", expiresInDays: 30 }));
      expect(h.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: "u1", tenantId: T, sessionId: "sess-1", authTime: Math.floor(NOW.getTime() / 1000) }),
        expect.objectContaining({ algorithm: "RS256", privateKey: "PEM", header: { alg: "RS256", kid: "k1" }, expiresIn: "15m" }),
      );
      expect(h.jwks.getCurrentSigningKey).toHaveBeenCalledWith(T);
      expect(eventTypes(h)).toEqual([SecurityEventType.LOGIN_SUCCESS]);
      expect(h.throttle.refund).toHaveBeenCalledWith(T, "ann@example.com");
      expect(h.brute.resetFailedAttempts).toHaveBeenCalled();
    });

    it("returns an mfa_pending temp token when MFA is enabled and issues no session", async () => {
      const h = build();
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: true, methods: ["totp", "backup"], preferredMethod: undefined });
      const out = await h.service.login(creds);
      expect(out).toMatchObject({ mfaRequired: true, tempToken: "signed", availableMethods: ["totp"], preferredMethod: "totp" });
      expect(h.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: "mfa_pending", sub: "u1", jti: expect.any(String) }),
        expect.objectContaining({ expiresIn: "5m" }),
      );
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
      expect(eventTypes(h)).toEqual([SecurityEventType.MFA_CHALLENGE_SENT]);
    });

    it("uses a fresh jti per MFA challenge", async () => {
      const h = build();
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: true, methods: ["totp"], preferredMethod: "totp" });
      await h.service.login(creds);
      await h.service.login(creds);
      const jtis = h.jwt.sign.mock.calls.map((c) => (c[0] as { jti: string }).jti);
      expect(new Set(jtis).size).toBe(2);
    });

    it("requires enrollment when policy enforces MFA for everyone", async () => {
      const h = build();
      h.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: true, enforceForAdmins: false });
      await expect(h.service.login(creds)).resolves.toEqual({ status: "mfa_enrollment_required", enrollmentToken: "enroll-token" });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });

    it.each([
      ["Owner", true],
      ["admin", true],
      ["viewer", false],
    ])("admin-only enforcement with role %s -> enrollment=%s", async (role, needs) => {
      const h = build();
      h.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
      h.userRoleRepo.find.mockResolvedValue([{ role: { name: role } }]);
      const out = await h.service.login(creds);
      expect("status" in out).toBe(needs);
    });

    it("rejects an unverified email only when the tenant requires verification", async () => {
      const h = build(baseUser({ emailVerified: false, tenant: { id: T, slug: "a", featureFlags: { emailVerificationRequired: true } } }));
      await expect(h.service.login(creds)).rejects.toMatchObject({ code: "AUTH_EMAIL_NOT_VERIFIED" });
      const ok = build(baseUser({ emailVerified: false }));
      await expect(ok.service.login(creds)).resolves.toHaveProperty("accessToken");
    });

    it("falls back to empty slug when the tenant relation is missing", async () => {
      const h = build(baseUser({ tenant: undefined }));
      h.tenantRepo.findOne.mockResolvedValue(null as never);
      const out = (await h.service.login(creds)) as { tenantSlug: string };
      expect(out.tenantSlug).toBe("");
    });

    it("rejects a suspended (isActive=false) user", async () => {
      const h = build(baseUser({ isActive: false }));
      await expect(h.service.login(creds)).rejects.toMatchObject({ code: "USER_SUSPENDED" });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });

    it("does not reveal a suspended account to a wrong password", async () => {
      verify.mockResolvedValue(false);
      const h = build(baseUser({ isActive: false }));
      await expect(h.service.login({ ...creds, password: "wrong-password" })).rejects.toMatchObject({
        code: "AUTH_INVALID_CREDENTIALS",
      });
    });
  });

  // -------------------------------------------------------------------- logout
  it("logout revokes the session in-tenant, clears the refresh hash, revokes tokens and logs", async () => {
    const h = build();
    await h.service.logout(T, "u1", "sess-1", "ua", "1.1.1.1");
    expect(h.sessionRepo.update).toHaveBeenCalledWith(
      { id: "sess-1", tenantId: T },
      { revokedAt: NOW, revokedReason: "user_logout", refreshTokenHash: null },
    );
    expect(h.oauthRefresh.revokeSessionTokens).toHaveBeenCalledWith("sess-1", T, "user_logout");
    expect(eventTypes(h)).toEqual([SecurityEventType.LOGOUT]);
  });

  // ------------------------------------------------------------ forgot password
  describe("forgotPassword", () => {
    it("is silent for unknown emails (no enumeration)", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.forgotPassword(T, "x@y.z", "1.1.1.1")).resolves.toBeUndefined();
      expect(h.email.sendPasswordResetOtpEmail).not.toHaveBeenCalled();
      expect(h.userRepo.update).not.toHaveBeenCalled();
    });

    it("stores only the SHA-256 of a 6-digit OTP, resets the attempt budget and emails the OTP", async () => {
      const h = build();
      await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
      const otp = h.email.sendPasswordResetOtpEmail.mock.calls[0]![1] as string;
      expect(otp).toMatch(/^\d{6}$/);
      const [where, patch] = h.userRepo.update.mock.calls[0] as [object, Record<string, unknown>];
      expect(where).toEqual({ id: "u1", tenantId: T });
      expect(patch.passwordResetToken).toBe(sha(otp));
      expect(patch.passwordResetToken).not.toBe(otp);
      expect(patch.passwordResetExpiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
      expect(h.redis.delete).toHaveBeenCalledWith(T, "pwreset-attempts", "u1");
      expect(eventTypes(h)).toEqual([SecurityEventType.PASSWORD_RESET_REQUESTED]);
    });

    it("also emails a single-use link token (stored hashed) before the code", async () => {
      const h = build();
      await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
      const token = h.email.sendPasswordResetEmail.mock.calls[0]![1] as string;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(h.email.sendPasswordResetEmail.mock.invocationCallOrder[0]).toBeLessThan(
        h.email.sendPasswordResetOtpEmail.mock.invocationCallOrder[0]!,
      );
      await expect(h.service.validateResetLink(T, token)).resolves.toMatchObject({ valid: true });
      // a second request supersedes the first link
      await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
      await expect(h.service.validateResetLink(T, token)).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
    });

    it("validateResetLink is tenant-bound and never consumes", async () => {
      const h = build();
      await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
      const token = h.email.sendPasswordResetEmail.mock.calls[0]![1] as string;
      await h.service.validateResetLink(T, token);
      await h.service.validateResetLink(T, token);
      await expect(h.service.validateResetLink("other-tenant", token)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      await expect(h.service.validateResetLink(T, "x".repeat(64))).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });

    it("validateResetLink reports an expired link distinctly", async () => {
      const h = build();
      await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
      const token = h.email.sendPasswordResetEmail.mock.calls[0]![1] as string;
      jest.setSystemTime(new Date(NOW.getTime() + 61 * 60_000));
      await expect(h.service.validateResetLink(T, token)).rejects.toMatchObject({ code: "LINK_EXPIRED" });
    });

    it("zero-pads small OTPs", async () => {
      (crypto.randomInt as unknown as jest.Mock).mockImplementationOnce(() => 42);
      const h = build();
      await h.service.forgotPassword(T, "ann@example.com", "ip");
      expect(h.email.sendPasswordResetOtpEmail.mock.calls[0]![1]).toBe("000042");
    });
  });

  // ---------------------------------------------------------------- magic link
  describe("magic link", () => {
    it("sendMagicLink is silent for unknown users", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await h.service.sendMagicLink(T, "x@y.z");
      expect(h.email.sendMagicLinkEmail).not.toHaveBeenCalled();
    });

    it("sendMagicLink stores the hash (10 min) and mails the raw token", async () => {
      const h = build();
      await h.service.sendMagicLink(T, "ann@example.com");
      const raw = h.email.sendMagicLinkEmail.mock.calls[0]![1] as string;
      expect(raw).toMatch(/^[0-9a-f]{64}$/);
      expect(h.userRepo.update).toHaveBeenCalledWith(
        { id: "u1", tenantId: T },
        { magicLinkToken: sha(raw), magicLinkExpiresAt: new Date(NOW.getTime() + 600_000) },
      );
    });

    it("verifyMagicLink rejects unknown/expired tokens", async () => {
      const h = build(null);
      await expect(h.service.verifyMagicLink(T, "bad", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });

    it("verifyMagicLink distinguishes an expired and an already-used link", async () => {
      const h = build(null);
      h.builder.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u1" });
      await expect(h.service.verifyMagicLink(T, "old", "ip", "ua")).rejects.toMatchObject({ code: "LINK_EXPIRED" });
      await h.linkTokens.noteSpent(T, "magic-link", "spent");
      await expect(h.service.verifyMagicLink(T, "spent", "ip", "ua")).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
    });

    it("verifyMagicLink looks up by hash within tenant and non-expired, then issues a session", async () => {
      const h = build();
      const out = await h.service.verifyMagicLink(T, "rawtoken", "ip", "ua");
      expect(h.builder.where).toHaveBeenCalledWith("user.magicLinkToken = :tokenHash", { tokenHash: sha("rawtoken") });
      expect(h.builder.andWhere).toHaveBeenCalledWith("user.tenantId = :tenantId", { tenantId: T });
      expect(out).toMatchObject({ accessToken: "signed", refreshToken: "refresh-1", tenantSlug: "acme" });
      expect(eventTypes(h)).toEqual([SecurityEventType.LOGIN_SUCCESS]);
    });

    it("verifyMagicLink enforces MFA enrollment policy before issuing a session", async () => {
      const h = build();
      h.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: true, enforceForAdmins: false });
      await expect(h.service.verifyMagicLink(T, "t", "ip", "ua")).resolves.toEqual({ status: "mfa_enrollment_required", enrollmentToken: "enroll-token" });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });

    it("verifyMagicLink applies admin-only enrollment", async () => {
      const h = build();
      h.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
      h.userRoleRepo.find.mockResolvedValue([{ role: { name: "ADMIN" } }]);
      await expect(h.service.verifyMagicLink(T, "t", "ip", "ua")).resolves.toHaveProperty("status", "mfa_enrollment_required");
    });

    // `undefined` is skipped by TypeORM update(), so the one-time token must be cleared with null.
    it("clears the one-time token with null so it cannot be replayed", async () => {
      const h = build();
      await h.service.verifyMagicLink(T, "rawtoken", "ip", "ua");
      const patch = h.userRepo.update.mock.calls[0]![1] as Record<string, unknown>;
      expect(patch.magicLinkToken).toBeNull();
      expect(patch.magicLinkExpiresAt).toBeNull();
    });

    // An enrolled MFA factor must not be bypassed via magic link: an mfa_pending challenge is returned.
    it("does not bypass an enrolled MFA factor", async () => {
      const h = build();
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: true, methods: ["totp"] });
      const out = await h.service.verifyMagicLink(T, "t", "ip", "ua");
      expect(out).toHaveProperty("mfaRequired", true);
      expect(out).not.toHaveProperty("accessToken");
    });
  });

  // ------------------------------------------------------------ reset password
  describe("resetPassword", () => {
    const OTP = "123456";
    const resetUser = (o: Record<string, unknown> = {}) =>
      baseUser({
        passwordResetToken: sha(OTP),
        passwordResetExpiresAt: new Date(NOW.getTime() + 60_000),
        passwordHash: "old-hash",
        passwordHistory: [],
        ...o,
      });

    it.each([
      ["no user", null],
      ["no token", resetUser({ passwordResetToken: null })],
      ["no expiry", resetUser({ passwordResetExpiresAt: null })],
      ["expired", resetUser({ passwordResetExpiresAt: new Date(NOW.getTime() - 1) })],
      ["expires exactly now", resetUser({ passwordResetExpiresAt: new Date(NOW) })],
    ])("answers AUTH_OTP_INVALID for %s without spending an attempt", async (_n, user) => {
      const h = build(user);
      await expect(h.service.resetPassword(T, "a@b.c", OTP, STRONG)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
      expect(h.redis.incr).not.toHaveBeenCalled();
    });

    describe("by link token", () => {
      const issue = async (h: ReturnType<typeof build>) => {
        await h.service.forgotPassword(T, "ann@example.com", "1.1.1.1");
        return h.email.sendPasswordResetEmail.mock.calls[0]![1] as string;
      };

      it("resets the password, spends the link, clears the code and revokes sessions", async () => {
        const h = build(resetUser());
        const token = await issue(h);
        h.userRepo.update.mockClear();
        await h.service.resetPasswordWithToken(T, token, STRONG, "9.9.9.9", { userAgent: "ua", requestId: "r1" });
        const patch = h.userRepo.update.mock.calls[0]![1] as Record<string, unknown>;
        expect(patch).toMatchObject({ passwordResetToken: null, passwordResetExpiresAt: null });
        expect(h.effects.afterPasswordChange).toHaveBeenCalledWith(expect.objectContaining({ reason: "password_reset", ip: "9.9.9.9" }));
        await expect(h.service.resetPasswordWithToken(T, token, STRONG)).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
      });

      it("a rejected password leaves the link usable", async () => {
        const h = build(resetUser());
        const token = await issue(h);
        await expect(h.service.resetPasswordWithToken(T, token, "short")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
        await expect(h.service.validateResetLink(T, token)).resolves.toMatchObject({ valid: true });
        await h.service.resetPasswordWithToken(T, token, STRONG);
      });

      it("the OTP path spends an outstanding link", async () => {
        const h = build(resetUser());
        const token = await issue(h);
        await h.service.resetPassword(T, "ann@example.com", OTP, STRONG);
        await expect(h.service.validateResetLink(T, token)).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
      });

      it("rejects an unknown token and a token from another tenant", async () => {
        const h = build(resetUser());
        const token = await issue(h);
        await expect(h.service.resetPasswordWithToken(T, "z".repeat(64), STRONG)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
        await expect(h.service.resetPasswordWithToken("tenant-2", token, STRONG)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      });

      it("only one of two concurrent uses wins", async () => {
        const h = build(resetUser());
        const token = await issue(h);
        const results = await Promise.allSettled([
          h.service.resetPasswordWithToken(T, token, STRONG),
          h.service.resetPasswordWithToken(T, token, STRONG),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      });
    });

    it("binds the lookup to tenant and case-insensitive email", async () => {
      const h = build(resetUser());
      await h.service.resetPassword(T, "ANN@EXAMPLE.COM", OTP, STRONG);
      expect(h.builder.where).toHaveBeenCalledWith("user.tenantId = :tenantId", { tenantId: T });
      expect(h.builder.andWhere).toHaveBeenCalledWith("LOWER(user.email) = LOWER(:email)", { email: "ANN@EXAMPLE.COM" });
    });

    it("rejects a wrong code (same error) and counts the attempt with a TTL on the first one", async () => {
      const h = build(resetUser());
      await expect(h.service.resetPassword(T, "a@b.c", "000000", STRONG)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
      expect(h.redis.extendTTL).toHaveBeenCalledWith(T, "pwreset-attempts", "u1", 900);
      expect(h.userRepo.update).not.toHaveBeenCalled();
    });

    it("does not reset the TTL on later attempts", async () => {
      const h = build(resetUser());
      h.redis.incr.mockResolvedValue(3);
      await expect(h.service.resetPassword(T, "a@b.c", "000000", STRONG)).rejects.toBeDefined();
      expect(h.redis.extendTTL).not.toHaveBeenCalled();
    });

    it("allows exactly 5 attempts; the 6th burns the code even if correct", async () => {
      const h = build(resetUser());
      h.redis.incr.mockResolvedValue(5);
      await expect(h.service.resetPassword(T, "a@b.c", OTP, STRONG)).resolves.toBeUndefined();

      const h2 = build(resetUser());
      h2.redis.incr.mockResolvedValue(6);
      await expect(h2.service.resetPassword(T, "a@b.c", OTP, STRONG)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
      expect(h2.userRepo.update).toHaveBeenCalledWith({ id: "u1", tenantId: T }, { passwordResetToken: null, passwordResetExpiresAt: null });
      expect(h2.redis.delete).toHaveBeenCalledWith(T, "pwreset-attempts", "u1");
      expect(eventTypes(h2)).toEqual([SecurityEventType.BRUTE_FORCE_THRESHOLD]);
      expect(h2.effects.afterPasswordChange).not.toHaveBeenCalled();
    });

    it("compares codes in constant time", async () => {
      const spy = crypto.timingSafeEqual as unknown as jest.Mock;
      spy.mockClear();
      const h = build(resetUser());
      await h.service.resetPassword(T, "a@b.c", OTP, STRONG);
      expect(spy).toHaveBeenCalled();
    });

    it("rejects a malformed stored token (length mismatch) rather than throwing", async () => {
      const h = build(resetUser({ passwordResetToken: "abcd" }));
      await expect(h.service.resetPassword(T, "a@b.c", OTP, STRONG)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
    });

    it("enforces the password policy after the code is proven", async () => {
      const h = build(resetUser());
      await expect(h.service.resetPassword(T, "a@b.c", OTP, "short")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
      expect(h.userRepo.update).not.toHaveBeenCalled();
    });

    it("rejects a password found in the recent history", async () => {
      const h = build(resetUser({ passwordHistory: ["h1", "h2"] }));
      verify.mockImplementation(async (hash: string) => hash === "h2");
      await expect(h.service.resetPassword(T, "a@b.c", OTP, STRONG)).rejects.toMatchObject({
        code: "PASSWORD_POLICY",
        errors: [{ field: "password", message: expect.stringContaining("used recently") }],
      });
      expect(h.userRepo.update).not.toHaveBeenCalled();
    });

    it("updates hash, caps history at 5 (newest first), nulls the code and revokes sessions", async () => {
      const h = build(resetUser({ passwordHistory: ["h1", "h2", "h3", "h4", "h5"] }));
      verify.mockResolvedValue(false);
      await h.service.resetPassword(T, "a@b.c", OTP, STRONG, "9.9.9.9", { userAgent: "UA", requestId: "r1" });
      expect(h.userRepo.update).toHaveBeenCalledWith(
        { id: "u1", tenantId: T },
        {
          passwordHash: "new-hash",
          passwordHistory: ["old-hash", "h1", "h2", "h3", "h4"],
          passwordChangedAt: NOW,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      );
      expect(h.redis.delete).toHaveBeenCalledWith(T, "pwreset-attempts", "u1");
      expect(h.effects.afterPasswordChange).toHaveBeenCalledWith(
        expect.objectContaining({ ip: "9.9.9.9", userAgent: "UA", requestId: "r1", reason: "password_reset", eventType: SecurityEventType.PASSWORD_RESET_COMPLETED }),
      );
    });

    it("handles users with no previous hash/history and default metadata", async () => {
      const h = build(resetUser({ passwordHash: null, passwordHistory: undefined }));
      await h.service.resetPassword(T, "a@b.c", OTP, STRONG);
      expect(h.userRepo.update.mock.calls[0]![1]).toMatchObject({ passwordHistory: [] });
      expect(h.effects.afterPasswordChange).toHaveBeenCalledWith(expect.objectContaining({ ip: "0.0.0.0", userAgent: "unknown" }));
    });
  });

  // -------------------------------------------------------------- verify email
  describe("verifyEmail / resendVerification", () => {
    it("rejects an invalid/expired token", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.verifyEmail(T, "tok")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });

    it("verifyEmail distinguishes expired and already-used tokens", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValueOnce(null as never).mockResolvedValueOnce({ id: "u1" } as never);
      await expect(h.service.verifyEmail(T, "old")).rejects.toMatchObject({ code: "LINK_EXPIRED" });
      await h.linkTokens.noteSpent(T, "verify-email", "spent");
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.verifyEmail(T, "spent")).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
    });

    it("marks the email verified (tenant-scoped) and logs", async () => {
      const h = build();
      await h.service.verifyEmail(T, "tok");
      expect(h.userRepo.findOne.mock.calls[0]![0]).toMatchObject({ where: { tenantId: T, emailVerificationToken: sha256Hex("tok") } });
      expect(h.userRepo.update).toHaveBeenCalledWith(
        { id: "u1", tenantId: T },
        { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
      );
      expect(eventTypes(h)).toEqual([SecurityEventType.EMAIL_VERIFIED]);
    });

    it("resendVerification sends a new 24h token to unverified users only", async () => {
      const h = build(baseUser({ emailVerified: false }));
      await h.service.resendVerification(T, "ann@example.com");
      const token = h.email.sendVerificationEmail.mock.calls[0]![1] as string;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(h.userRepo.update).toHaveBeenCalledWith(
        { id: "u1", tenantId: T },
        { emailVerificationToken: sha256Hex(token), emailVerificationExpiresAt: new Date(NOW.getTime() + 24 * 3600_000) },
      );
    });

    it("resendVerification is silent for unknown users", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await h.service.resendVerification(T, "x@y.z");
      expect(h.email.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------- refresh
  describe("refreshToken", () => {
    const rotated = {
      accessTokenPayload: { sub: "u1", email: "ann@example.com", tenantId: T, sessionId: "sess-1" },
      newToken: "new-refresh",
    };

    it("rotates, keeps the original login time, stores the new hash and logs", async () => {
      const h = build();
      h.oauthRefresh.rotateRefreshToken.mockResolvedValue(rotated);
      h.sessionRepo.findOne.mockResolvedValue({ id: "sess-1", createdAt: new Date("2026-06-30T00:00:00Z") });
      const out = await h.service.refreshToken(T, "old", "1.1.1.1", "ua");
      expect(out).toMatchObject({ accessToken: "signed", refreshToken: "new-refresh", tenantSlug: "acme" });
      expect(h.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ authTime: Math.floor(new Date("2026-06-30T00:00:00Z").getTime() / 1000) }),
        expect.anything(),
      );
      expect(h.sessionRepo.update).toHaveBeenCalledWith(
        { id: "sess-1", tenantId: T },
        expect.objectContaining({
          refreshTokenHash: sha("new-refresh"),
          refreshExpiresAt: new Date(NOW.getTime() + 30 * 86400_000),
          lastUsedAt: NOW,
        }),
      );
      expect(eventTypes(h)).toEqual([SecurityEventType.TOKEN_REFRESHED]);
    });

    it("uses authTime 0 when the login session cannot be found, and skips session update without sessionId", async () => {
      const h = build();
      h.oauthRefresh.rotateRefreshToken.mockResolvedValue({ ...rotated, accessTokenPayload: { ...rotated.accessTokenPayload, sessionId: "" } });
      h.sessionRepo.findOne.mockResolvedValue(null);
      await h.service.refreshToken(T, "old", "ip", "ua");
      expect(h.jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ authTime: 0 }), expect.anything());
      expect(h.sessionRepo.update).not.toHaveBeenCalled();
    });

    it("logs TOKEN_ROTATION_FAILED and rethrows ordinary failures without publishing reuse", async () => {
      const h = build();
      h.oauthRefresh.rotateRefreshToken.mockRejectedValue(new ApiException("AUTH_TOKEN_INVALID"));
      await expect(h.service.refreshToken(T, "x", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      expect(eventTypes(h)).toEqual([SecurityEventType.TOKEN_ROTATION_FAILED]);
      expect(h.domainEvents.publish).not.toHaveBeenCalled();
    });

    it("records 'unknown' reason for non-Error rejections", async () => {
      const h = build();
      h.oauthRefresh.rotateRefreshToken.mockRejectedValue("weird");
      await expect(h.service.refreshToken(T, "x", "ip", "ua")).rejects.toBe("weird");
      expect(h.events.log.mock.calls[0]![0]).toMatchObject({ metadata: { reason: "unknown" } });
    });

    describe("reuse notification", () => {
      const reuse = () => new ApiException("AUTH_REFRESH_REUSED");

      it("publishes for ApiException AUTH_REFRESH_REUSED using the token hash within the tenant", async () => {
        const h = build(baseUser({ firstName: "" }));
        h.oauthRefresh.rotateRefreshToken.mockRejectedValue(reuse());
        h.refreshRepo.findOne.mockResolvedValue({ id: "rt", userId: "u1" });
        await expect(h.service.refreshToken(T, "stale", "ip", "ua", "req-1")).rejects.toMatchObject({ code: "AUTH_REFRESH_REUSED" });
        expect(h.refreshRepo.findOne.mock.calls[0]![0]).toMatchObject({ where: { tenantId: T, tokenHash: sha("stale") } });
        expect(h.domainEvents.publish).toHaveBeenCalledWith(
          DomainEventName.SESSION_REFRESH_REUSE_DETECTED,
          expect.objectContaining({ tenantId: T, userId: "u1", email: "ann@example.com", name: undefined, tenantName: "Acme", requestId: "req-1" }),
        );
      });

      it("publishes for legacy HttpException messages mentioning reuse", async () => {
        const h = build();
        h.oauthRefresh.rotateRefreshToken.mockRejectedValue(new HttpException("Token Reuse Detected", 401));
        h.refreshRepo.findOne.mockResolvedValue({ id: "rt", userId: "u1" });
        await expect(h.service.refreshToken(T, "stale", "ip", "ua")).rejects.toBeInstanceOf(HttpException);
        expect(h.domainEvents.publish).toHaveBeenCalled();
      });

      it("does not publish for unrelated HttpExceptions or plain errors", async () => {
        const h = build();
        h.oauthRefresh.rotateRefreshToken.mockRejectedValue(new HttpException("nope", 401));
        await expect(h.service.refreshToken(T, "s", "ip", "ua")).rejects.toBeDefined();
        h.oauthRefresh.rotateRefreshToken.mockRejectedValue(new Error("reuse detected"));
        await expect(h.service.refreshToken(T, "s", "ip", "ua")).rejects.toBeDefined();
        expect(h.domainEvents.publish).not.toHaveBeenCalled();
      });

      it("silently skips when the stored token or user cannot be found", async () => {
        const h = build();
        h.oauthRefresh.rotateRefreshToken.mockRejectedValue(reuse());
        h.refreshRepo.findOne.mockResolvedValue(null);
        await expect(h.service.refreshToken(T, "s", "ip", "ua")).rejects.toBeDefined();
        h.refreshRepo.findOne.mockResolvedValue({ id: "rt", userId: "gone" });
        h.userRepo.findOne.mockResolvedValue(null as never);
        await expect(h.service.refreshToken(T, "s", "ip", "ua")).rejects.toBeDefined();
        expect(h.domainEvents.publish).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------- current user
  describe("getCurrentUser", () => {
    it("is tenant-scoped and returns only safe fields", async () => {
      const h = build(baseUser({ passwordHash: "secret", displayName: "Ann L", phoneVerified: false, lastLoginAt: NOW, lastLoginIp: "1.1.1.1" }));
      const out = await h.service.getCurrentUser(T, "u1");
      expect(h.userRepo.findOne).toHaveBeenCalledWith({ where: { id: "u1", tenantId: T }, relations: ["tenant"] });
      expect(JSON.stringify(out)).not.toContain("secret");
      expect(out).toMatchObject({ id: "u1", displayName: "Ann L", tenant: { id: T, name: "Acme", slug: "acme" } });
    });

    it("throws RESOURCE_NOT_FOUND for another tenant's user", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.getCurrentUser("other", "u1")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    });
  });

  // ------------------------------------------------------------ private helpers
  describe("legacy private helpers", () => {
    type Priv = {
      incrementFailedAttempts(t: string, u: string): Promise<void>;
      revokeSessionFamily(f: string): Promise<void>;
    };

    it("incrementFailedAttempts counts and locks at 5 for 15 minutes", async () => {
      const h = build(baseUser({ failedLoginAttempts: 3 }));
      await (h.service as unknown as Priv).incrementFailedAttempts(T, "u1");
      expect(h.userRepo.update).toHaveBeenLastCalledWith({ id: "u1", tenantId: T }, { failedLoginAttempts: 4 });
      h.userRepo.findOne.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }) as never);
      await (h.service as unknown as Priv).incrementFailedAttempts(T, "u1");
      expect(h.userRepo.update).toHaveBeenLastCalledWith(
        { id: "u1", tenantId: T },
        { failedLoginAttempts: 5, lockedUntil: new Date(NOW.getTime() + 15 * 60_000) },
      );
    });

    it("incrementFailedAttempts ignores unknown users", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await (h.service as unknown as Priv).incrementFailedAttempts(T, "u1");
      expect(h.userRepo.update).not.toHaveBeenCalled();
    });

    it("revokeSessionFamily revokes only non-revoked sessions of the family", async () => {
      const h = build();
      await (h.service as unknown as Priv).revokeSessionFamily("fam");
      const [criteria, patch] = h.sessionRepo.update.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
      expect(criteria.refreshTokenFamilyId).toBe("fam");
      expect(criteria).toHaveProperty("revokedAt");
      expect(patch).toMatchObject({ revokedReason: "token_reuse_detected" });
    });
  });

  // ------------------------------------------------------------------------ MFA
  describe("verifyMfa / verifyMfaBackup", () => {
    const pending = { sub: "u1", email: "ann@example.com", type: "mfa_pending", jti: "j1" };

    function withToken(payload: Record<string, unknown> | Error) {
      const h = build();
      if (payload instanceof Error) h.jwt.verify.mockImplementation(() => { throw payload; });
      else h.jwt.verify.mockReturnValue(payload);
      return h;
    }

    it("verifies the temp token with RS256 and the signing key for that token", async () => {
      const h = withToken(pending);
      await h.service.verifyMfa(T, "temp", "123456", "ip", "ua");
      expect(h.jwks.getPublicKeyForToken).toHaveBeenCalledWith("temp");
      expect(h.jwt.verify).toHaveBeenCalledWith("temp", { publicKey: "PUBPEM", algorithms: ["RS256"] });
    });

    it("maps an expired temp token to AUTH_TOKEN_EXPIRED", async () => {
      const err = Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });
      await expect(withToken(err).service.verifyMfa(T, "t", "1", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" });
    });

    it("maps a tampered temp token to AUTH_TOKEN_INVALID (also non-Error throws)", async () => {
      await expect(withToken(new Error("invalid signature")).service.verifyMfa(T, "t", "1", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      const h = build();
      h.jwks.getPublicKeyForToken.mockRejectedValue("str" as never);
      await expect(h.service.verifyMfa(T, "t", "1", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });

    it("rejects a non-mfa_pending token (an access token cannot be used as a temp token)", async () => {
      const h = withToken({ ...pending, type: undefined });
      await expect(h.service.verifyMfa(T, "t", "1", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      expect(h.mfa.verifyTotp).not.toHaveBeenCalled();
    });

    it("rejects an invalid TOTP code and issues nothing", async () => {
      const h = withToken(pending);
      h.mfa.verifyTotp.mockResolvedValue(false);
      await expect(h.service.verifyMfa(T, "t", "000000", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });

    it("passes the challenge jti (or undefined) to the MFA service", async () => {
      const h = withToken(pending);
      await h.service.verifyMfa(T, "t", "123456", "ip", "ua");
      expect(h.mfa.verifyTotp).toHaveBeenCalledWith("u1", T, "123456", "j1");
      const h2 = withToken({ ...pending, jti: 5 });
      await h2.service.verifyMfa(T, "t", "123456", "ip", "ua");
      expect(h2.mfa.verifyTotp).toHaveBeenCalledWith("u1", T, "123456", undefined);
    });

    it("creates a session whose refresh token comes from OAuthRefreshTokenService and defaults the user agent", async () => {
      const h = withToken(pending);
      const out = await h.service.verifyMfa(T, "t", "123456", "ip", "");
      const arg = h.sessionService.createSession.mock.calls[0]![0] as Record<string, string>;
      expect(arg.userAgent).toBe("unknown");
      expect(arg.refreshTokenHash).toBeUndefined();
      expect(out.refreshToken).toBe((await h.oauthRefresh.createRefreshToken.mock.results[0]!.value).token);
      expect(out).toMatchObject({ accessToken: "signed", tenantSlug: "acme", message: "MFA verified successfully" });
    });

    // BUG: the post-MFA refresh token is a random string stored only as session.refreshTokenHash,
    // while /refresh rotates tokens from OAuthRefreshTokenService (createRefreshToken is used for
    // password/magic-link/passkey logins). Refreshing after MFA login therefore cannot succeed.
    it("records pwd+otp+totp+mfa as the session and token amr after a TOTP step-up", async () => {
      const h = withToken(pending);
      await h.service.verifyMfa(T, "t", "123456", "ip", "ua");
      expect(h.sessionService.createSession).toHaveBeenCalledWith(expect.objectContaining({ amr: ["pwd", "otp", "totp", "mfa"] }));
      expect(h.jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ amr: ["pwd", "otp", "totp", "mfa"] }), expect.anything());
    });

    it("registers the post-MFA refresh token with OAuthRefreshTokenService", async () => {
      const h = withToken(pending);
      await h.service.verifyMfa(T, "t", "123456", "ip", "ua");
      expect(h.oauthRefresh.createRefreshToken).toHaveBeenCalled();
    });

    it("backup code: rejects invalid codes", async () => {
      const h = withToken(pending);
      h.mfa.verifyBackupCode.mockResolvedValue(false);
      await expect(h.service.verifyMfaBackup(T, "t", "bad", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
    });

    it.each([
      [8, undefined],
      [3, undefined],
      [2, "Only 2 backup codes remaining"],
      [0, "Only 0 backup codes remaining"],
    ])("backup code: with %i remaining warns=%s", async (remaining, warning) => {
      const h = withToken(pending);
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: true, backupCodesRemaining: remaining });
      const out = await h.service.verifyMfaBackup(T, "t", "ok", "", "");
      if (warning) expect(out.warning).toContain(warning);
      else expect(out.warning).toBeUndefined();
      expect(out.message).toBe("Backup code verified successfully");
      expect(h.mfa.verifyBackupCode).toHaveBeenCalledWith("u1", T, "ok", "j1");
    });

    it("backup code: ignores a non-string jti and rejects wrong token types", async () => {
      const h = withToken({ ...pending, jti: undefined });
      await h.service.verifyMfaBackup(T, "t", "ok", "ip", "ua");
      expect(h.mfa.verifyBackupCode).toHaveBeenCalledWith("u1", T, "ok", undefined);
      const bad = withToken({ ...pending, type: "access" });
      await expect(bad.service.verifyMfaBackup(T, "t", "ok", "ip", "ua")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });
  });

  // ------------------------------------------------------------------- WebAuthn
  describe("WebAuthn login", () => {
    const fin = (over: Record<string, unknown> = {}) => ({
      tenantId: T,
      email: "ann@example.com",
      webauthnResponse: {} as never,
      sessionNonce: "n1",
      ip: "ip",
      userAgent: "ua",
      deviceId: "dev",
      ...over,
    });

    it("start: unknown user gives AUTH_INVALID_CREDENTIALS", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.startWebAuthnLogin(T, "x@y.z")).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    });

    it("start: returns flat options plus the nonce", async () => {
      const h = build();
      await expect(h.service.startWebAuthnLogin(T, "ann@example.com")).resolves.toEqual({ challenge: "c", sessionNonce: "n1" });
      expect(h.webauthn.startAuthentication).toHaveBeenCalledWith("u1", T);
    });

    it("finish: unknown user -> AUTH_INVALID_CREDENTIALS", async () => {
      const h = build(null);
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.finishWebAuthnLogin(fin())).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    });

    it("finish: failed assertion -> PASSKEY_INVALID and PASSKEY_AUTH_FAILED event", async () => {
      const h = build();
      h.webauthn.finishAuthentication.mockResolvedValue(false);
      await expect(h.service.finishWebAuthnLogin(fin())).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
      expect(eventTypes(h)).toEqual([SecurityEventType.PASSKEY_AUTH_FAILED]);
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });

    it("finish: passes the nonce and rejects suspended users", async () => {
      const h = build(baseUser({ isActive: false }));
      await expect(h.service.finishWebAuthnLogin(fin())).rejects.toMatchObject({ code: "USER_SUSPENDED" });
      expect(h.webauthn.finishAuthentication).toHaveBeenCalledWith("u1", T, {}, "n1");
    });

    it("finish: success issues session+tokens and logs PASSKEY_AUTH_SUCCESS", async () => {
      const h = build();
      const out = await h.service.finishWebAuthnLogin(fin());
      expect(out).toMatchObject({ accessToken: "signed", refreshToken: "refresh-1", tenantSlug: "acme", user: { email: "ann@example.com" } });
      expect(eventTypes(h)).toEqual([SecurityEventType.PASSKEY_AUTH_SUCCESS]);
    });

    it("finish: defers to MFA enrollment policy (all users / admins) when MFA is not enabled", async () => {
      const h = build();
      h.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: true, enforceForAdmins: false });
      await expect(h.service.finishWebAuthnLogin(fin())).resolves.toEqual({ status: "mfa_enrollment_required", enrollmentToken: "enroll-token" });
      const h2 = build();
      h2.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
      h2.userRoleRepo.find.mockResolvedValue([{ role: { name: "owner" } }]);
      await expect(h2.service.finishWebAuthnLogin(fin())).resolves.toHaveProperty("status");
      const h3 = build();
      h3.mfaPolicy.getForTenant.mockResolvedValue({ enforceForAllUsers: false, enforceForAdmins: true });
      await expect(h3.service.finishWebAuthnLogin(fin())).resolves.toHaveProperty("accessToken");
    });

    it("finish: skips policy lookup if MFA is already enabled", async () => {
      const h = build();
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: true });
      await h.service.finishWebAuthnLogin(fin());
      expect(h.mfaPolicy.getForTenant).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- login intent
  describe("getLoginIntent / getProviders / requiresMFA", () => {
    const tenantWith = (over: Record<string, unknown> = {}) => ({
      id: T,
      settings: {},
      featureFlags: {},
      branding: { color: "x" },
      ...over,
    });

    it("throws TENANT_NOT_FOUND for unknown tenants", async () => {
      const h = build();
      h.tenantRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.getLoginIntent("a@b.c", T)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
      await expect(h.service.getProviders(T)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    });

    it("unknown email + signup disabled returns an all-false methods set", async () => {
      const h = build(null);
      h.tenantRepo.findOne.mockResolvedValue(tenantWith({ settings: { allowSignup: false } }) as never);
      await expect(h.service.getLoginIntent("n@b.c", T)).resolves.toEqual({
        exists: false,
        email: "n@b.c",
        methods: { password: false, magicLink: false, passkey: false, mfa: false, social: [] },
      });
    });

    it("unknown email + signup allowed advertises password and enabled features", async () => {
      const h = build(null);
      h.tenantRepo.findOne.mockResolvedValue(
        tenantWith({ featureFlags: { magicLinkEnabled: true, passkeyEnabled: true, googleEnabled: true, githubEnabled: true, microsoftEnabled: true, appleEnabled: true, linkedinEnabled: true, facebookEnabled: true } }) as never,
      );
      const out = await h.service.getLoginIntent("n@b.c", T);
      expect(out).toMatchObject({
        exists: false,
        preferredMethod: "password",
        methods: { password: true, magicLink: true, passkey: true, mfa: false, social: ["google", "github", "microsoft", "apple", "linkedin", "facebook"] },
      });
    });

    it("existing user: only linked AND enabled social providers, passkey wins the default", async () => {
      const h = build(baseUser({ mfaEnabled: true }));
      h.tenantRepo.findOne.mockResolvedValue(tenantWith({ featureFlags: { passkeyEnabled: true, googleEnabled: true, githubEnabled: true } }) as never);
      h.socialConnRepo.find.mockResolvedValue([{ provider: "google" }, { provider: "apple" }]);
      const out = await h.service.getLoginIntent("ann@example.com", T);
      expect(out).toMatchObject({ exists: true, preferredMethod: "passkey", methods: { password: true, mfa: true, passkey: true, social: ["google"] } });
    });

    it.each([
      [{ magicLinkEnabled: true }, [], "magicLink"],
      [{ googleEnabled: true }, [{ provider: "google" }], "social"],
      [{}, [], "password"],
    ])("existing user default method with flags %j -> %s", async (flags, linked, expected) => {
      const h = build(baseUser({ passwordHash: null }));
      h.tenantRepo.findOne.mockResolvedValue(tenantWith({ featureFlags: flags }) as never);
      h.socialConnRepo.find.mockResolvedValue(linked);
      const out = await h.service.getLoginIntent("ann@example.com", T);
      expect(out.preferredMethod).toBe(expected);
      expect(out.methods.password).toBe(false);
    });

    it("respects the user's preferredAuthMethod", async () => {
      const h = build(baseUser({ preferredAuthMethod: "magicLink", mfaEnabled: undefined }));
      h.tenantRepo.findOne.mockResolvedValue(tenantWith({ featureFlags: { passkeyEnabled: true } }) as never);
      const out = await h.service.getLoginIntent("ann@example.com", T);
      expect(out.preferredMethod).toBe("magicLink");
      expect(out.methods.mfa).toBe(false);
    });

    it("getProviders lists only enabled configured providers with display names", async () => {
      const h = build();
      h.tenantRepo.findOne.mockResolvedValue(tenantWith({ featureFlags: { magicLinkEnabled: true } }) as never);
      h.providerRepo.find.mockResolvedValue([
        { provider: "google", enabled: true },
        { provider: "github", enabled: false },
        { provider: "custom", enabled: true },
      ]);
      await expect(h.service.getProviders(T)).resolves.toEqual({
        password: true,
        magicLink: true,
        passkey: false,
        social: [
          { provider: "google", enabled: true, displayName: "Google" },
          { provider: "custom", enabled: true, displayName: "custom" },
        ],
      });
    });

    it.each([
      ["magicLink", false],
      ["passkey", false],
      ["social", false],
      ["unknown", false],
    ])("requiresMFA(%s) is false", (m, expected) => {
      expect(build().service.requiresMFA(m, baseUser({ mfaEnabled: true }) as never)).toBe(expected);
    });

    it("requiresMFA(password) depends on user.mfaEnabled", () => {
      const { service } = build();
      expect(service.requiresMFA("password", baseUser({ mfaEnabled: true }) as never)).toBe(true);
      expect(service.requiresMFA("password", baseUser({ mfaEnabled: false }) as never)).toBe(false);
      expect(service.requiresMFA("password", baseUser({ mfaEnabled: undefined }) as never)).toBe(false);
    });
  });

  // --------------------------------------------------------------------- invites
  describe("invites", () => {
    const invite = (o: Record<string, unknown> = {}) => ({
      id: "inv1",
      token: "tok-123456789",
      email: "invitee@example.com",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      acceptedAt: null,
      roleIds: ["r1", "r2"],
      invitedBy: "admin",
      tenant: { id: T, name: "Acme", slug: "acme", active: true },
      ...o,
    });

    it("validateInvite returns metadata for a good invite", async () => {
      const h = build();
      h.inviteRepo.findOne.mockResolvedValue(invite());
      await expect(h.service.validateInvite("tok")).resolves.toEqual({ email: "invitee@example.com", tenantName: "Acme", tenantSlug: "acme" });
      h.inviteRepo.findOne.mockResolvedValue(invite({ tenant: undefined }));
      await expect(h.service.validateInvite("tok")).resolves.toMatchObject({ tenantName: "", tenantSlug: "" });
    });

    it.each([
      ["missing", null, undefined, "INVITE_INVALID"],
      ["used", invite({ acceptedAt: NOW }), "already been used", "LINK_ALREADY_USED"],
      ["expired", invite({ expiresAt: new Date(NOW.getTime() - 1) }), "expired", "LINK_EXPIRED"],
    ])("validateInvite and acceptInvite reject a %s invite", async (_n, inv, detail, code) => {
      const h = build();
      h.inviteRepo.findOne.mockResolvedValue(inv);
      const v = await h.service.validateInvite("tok").catch((e: ApiException) => e);
      expect(v).toMatchObject({ code });
      if (detail) expect((v as ApiException).detail).toContain(detail);
      const a = await h.service.acceptInvite({ token: "tok", name: "A", password: STRONG, ip: "ip", userAgent: "ua" }).catch((e: ApiException) => e);
      expect(a).toMatchObject({ code });
      expect(h.userRepo.save).not.toHaveBeenCalled();
    });

    it("acceptInvite rejects suspended/missing tenants and existing accounts", async () => {
      const h = build(null);
      const data = { token: "tok", name: "A", password: STRONG, ip: "ip", userAgent: "ua" };
      h.inviteRepo.findOne.mockResolvedValue(invite({ tenant: { id: T, active: false } }));
      await expect(h.service.acceptInvite(data)).rejects.toMatchObject({ code: "TENANT_SUSPENDED" });
      h.inviteRepo.findOne.mockResolvedValue(invite({ tenant: undefined }));
      await expect(h.service.acceptInvite(data)).rejects.toMatchObject({ code: "TENANT_SUSPENDED" });
      h.inviteRepo.findOne.mockResolvedValue(invite());
      h.userRepo.findOne.mockResolvedValue({ id: "dupe" } as never);
      await expect(h.service.acceptInvite(data)).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    });

    it("acceptInvite enforces the password policy including the invited email", async () => {
      const h = build(null);
      h.inviteRepo.findOne.mockResolvedValue(invite());
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.acceptInvite({ token: "t", name: "A", password: "invitee-password-123", ip: "ip", userAgent: "ua" })).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    });

    it("acceptInvite creates a verified user, assigns roles, consumes the invite and masks the token in the event", async () => {
      const h = build(null);
      h.inviteRepo.findOne.mockResolvedValue(invite());
      h.userRepo.findOne.mockResolvedValue(null as never);
      await expect(h.service.acceptInvite({ token: "tok-123456789", name: "  Mary Ann Smith ", password: STRONG, ip: "ip", userAgent: "ua" })).resolves.toEqual({ message: "Account created successfully", canSignInNow: true });
      expect(h.userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: T, email: "invitee@example.com", firstName: "Mary", lastName: "Ann Smith", emailVerified: true, isActive: true }));
      expect(h.userRoleRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: "r1", tenantId: T, userId: "new-user", invitedBy: "admin", isGuest: false }),
        expect.objectContaining({ roleId: "r2" }),
      ]);
      expect(h.inviteRepo.update).toHaveBeenCalledWith("inv1", { acceptedAt: NOW });
      const meta = (h.events.log.mock.calls[0]![0] as { metadata: { inviteToken: string } }).metadata;
      expect(meta.inviteToken).toBeUndefined(); // no part of the token is written to the audit trail
      expect(h.inviteRepo.findOne.mock.calls[0]![0]).toMatchObject({ where: { token: sha256Hex("tok-123456789") } });
    });

    it("acceptInvite handles single-word names and invites with no roles", async () => {
      const h = build(null);
      h.inviteRepo.findOne.mockResolvedValue(invite({ roleIds: [] }));
      h.userRepo.findOne.mockResolvedValue(null as never);
      await h.service.acceptInvite({ token: "tok-123456789", name: "Cher", password: STRONG, ip: "ip", userAgent: "ua" });
      expect(h.userRepo.create.mock.calls[0]![0]).toMatchObject({ firstName: "Cher", lastName: undefined });
      expect(h.userRoleRepo.save).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------- magic link match code
  describe("magic link number matching", () => {
    function memoryRedis() {
      const m = new Map<string, unknown>();
      const k = (...p: string[]) => p.join("|");
      return {
        set: async (t: string, r: string, i: string, v: unknown) => { m.set(k(t, r, i), v); },
        get: async (t: string, r: string, i: string) => m.get(k(t, r, i)) ?? null,
        delete: async (t: string, r: string, i: string) => { m.delete(k(t, r, i)); },
        setIfAbsent: async (t: string, r: string, i: string, v: unknown) => (m.has(k(t, r, i)) ? false : (m.set(k(t, r, i), v), true)),
        incr: async (t: string, r: string, i: string) => { const n = ((m.get(k(t, r, i)) as number) ?? 0) + 1; m.set(k(t, r, i), n); return n; },
        extendTTL: async () => undefined,
      };
    }
    async function start() {
      const h = build(baseUser({ magicLinkExpiresAt: new Date(NOW.getTime() + 60_000) }), memoryRedis());
      const sent = await h.service.sendMagicLink(T, "ann@example.com", { poll: true, ip: "6.6.6.6", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537" });
      const raw = h.email.sendMagicLinkEmail.mock.calls[0]![1] as string;
      return { h, sent, raw };
    }

    it("returns a 6-digit matchCode with the nonce, only in the response, and the preview names the requester", async () => {
      const { h, sent, raw } = await start();
      expect(sent.matchCode).toMatch(/^\d{6}$/);
      expect(JSON.stringify(h.email.sendMagicLinkEmail.mock.calls)).not.toContain(sent.matchCode!);
      await expect(h.service.previewMagicLink(T, raw)).resolves.toEqual({
        requestedFrom: { userAgent: "Chrome on Windows", ip: "6.6.6.6" },
        requiresMatchCode: true,
      });
    });

    it("a plain click signs in the clicker and voids the poll: the nonce never yields a session", async () => {
      const { h, sent, raw } = await start();
      const out = await h.service.verifyMagicLink(T, raw, "ip", "ua");
      expect(out).toMatchObject({ accessToken: "signed" });
      await expect(h.service.pollMagicLink(T, sent.pollingNonce!, "6.6.6.6", "ua")).resolves.toEqual({ status: "pending" });
    });

    it("the correct matchCode completes only the poller; the confirming device gets no session", async () => {
      const { h, sent, raw } = await start();
      const out = await h.service.verifyMagicLink(T, raw, "ip", "ua", sent.matchCode);
      expect(out).toEqual({ status: "confirmed-on-other-device" });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
      await expect(h.service.pollMagicLink(T, sent.pollingNonce!, "6.6.6.6", "ua")).resolves.toMatchObject({ accessToken: "signed" });
      await expect(h.service.pollMagicLink(T, sent.pollingNonce!, "6.6.6.6", "ua")).rejects.toMatchObject({ code: "LINK_ALREADY_USED" });
    });

    it("wrong codes are rejected without spending the link and void the request after 5 attempts", async () => {
      const { h, sent, raw } = await start();
      const wrong = sent.matchCode === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        await expect(h.service.verifyMagicLink(T, raw, "ip", "ua", wrong)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
      }
      await expect(h.service.verifyMagicLink(T, raw, "ip", "ua", sent.matchCode)).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
      await expect(h.service.pollMagicLink(T, sent.pollingNonce!, "6.6.6.6", "ua")).resolves.toEqual({ status: "pending" });
    });

    it("a code on a link without a pending request is rejected", async () => {
      const h = build(baseUser({ magicLinkExpiresAt: new Date(NOW.getTime() + 60_000) }), memoryRedis());
      await h.service.sendMagicLink(T, "ann@example.com", {});
      const raw = h.email.sendMagicLinkEmail.mock.calls[0]![1] as string;
      await expect(h.service.verifyMagicLink(T, raw, "ip", "ua", "123456")).rejects.toMatchObject({ code: "AUTH_OTP_INVALID" });
    });
  });

  describe("coarseUserAgent", () => {
    it.each([
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Version/17 Safari/605", "Safari on macOS"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604", "Safari on iOS"],
      ["Mozilla/5.0 (X11; Linux) Firefox/121.0", "Firefox on Linux"],
      [undefined, "Unknown browser on unknown OS"],
    ])("%s", (ua, expected) => expect(coarseUserAgent(ua as string | undefined)).toBe(expected));
  });

  // ------------------------------------------------------------------- step-up
  describe("reauthenticate", () => {
    const withUser = (mfaEnabled: boolean) => {
      const h = build(baseUser({ passwordHash: "stored" }));
      h.mfa.getMfaStatus.mockResolvedValue({ enabled: mfaEnabled, methods: mfaEnabled ? ["totp"] : [] });
      h.sessionRepo.findOne.mockResolvedValue({ id: "s1", amr: "pwd otp totp mfa", revokedAt: null } as never);
      verify.mockResolvedValue(true);
      return h;
    };
    const claims = (h: ReturnType<typeof withUser>) => h.jwt.sign.mock.calls.at(-1)![0] as { amr: string[]; authTime: number };

    it("password alone is enough for an account without MFA, and amr is only pwd", async () => {
      const h = withUser(false);
      await h.service.reauthenticate(T, "u1", "s1", { method: "password", password: "pw" });
      expect(claims(h).amr).toEqual(["pwd"]);
      expect(h.redis.set).toHaveBeenCalledWith(T, "reauth-at", "s1", expect.objectContaining({ amr: ["pwd"] }), expect.any(Number));
    });

    it("with MFA enrolled, password alone is refused and authTime is not refreshed", async () => {
      const h = withUser(true);
      await expect(h.service.reauthenticate(T, "u1", "s1", { method: "password", password: "pw" })).rejects.toMatchObject({ code: "AUTH_MFA_REQUIRED" });
      expect(h.redis.set).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it("password + TOTP in one request proves both; amr lists exactly those and is not merged with the session's", async () => {
      const h = withUser(true);
      await h.service.reauthenticate(T, "u1", "s1", { method: "password", password: "pw", code: "123456" });
      expect(claims(h).amr).toEqual(["pwd", "otp", "totp", "mfa"]);
      expect(h.mfa.verifyTotp).toHaveBeenCalledWith("u1", T, "123456", "reauth:s1");
    });

    it("TOTP alone proves only totp (no pwd, no mfa)", async () => {
      const h = withUser(true);
      await h.service.reauthenticate(T, "u1", "s1", { method: "totp", code: "123456" });
      expect(claims(h).amr).toEqual(["otp", "totp"]);
    });

    it("a wrong or replayed code is refused and nothing is refreshed", async () => {
      const h = withUser(true);
      h.mfa.verifyTotp.mockResolvedValue(false);
      await expect(h.service.reauthenticate(T, "u1", "s1", { method: "totp", code: "123456" })).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
      await expect(h.service.reauthenticate(T, "u1", "s1", { method: "password", password: "pw", code: "123456" })).rejects.toMatchObject({ code: "AUTH_MFA_INVALID" });
      expect(h.redis.set).not.toHaveBeenCalled();
    });

    it("password guesses are throttled like login", async () => {
      const h = withUser(false);
      h.throttle.charge.mockResolvedValue({ blocked: true });
      await expect(h.service.reauthenticate(T, "u1", "s1", { method: "password", password: "pw" }, { ip: "1.1.1.1", userAgent: "ua" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    });
  });
});

import { ApiException } from "@/common/http";
import { DomainEventName } from "@/common/service/domain-events.service";
import { AuthService } from "./auth.service";
import { verifyAgainstDummy, verifyPassword } from "./password-hashing";

jest.mock("./password-hashing", () => ({
  hashPassword: jest.fn(async () => "new-hash"),
  verifyPassword: jest.fn(),
  verifyAgainstDummy: jest.fn(async () => false),
}));

const verify = verifyPassword as jest.Mock;
const dummy = verifyAgainstDummy as jest.Mock;

const TENANT = "tenant-1";
const CTX = { tenantId: TENANT, ip: "1.1.1.1", userAgent: "ua" };

interface UserFixture {
  id: string;
  email: string;
  tenantId: string;
  firstName?: string;
  passwordHash: string | null;
  emailVerified: boolean;
  lockedUntil?: Date;
  tenant: { name: string; featureFlags: Record<string, boolean> };
}

const makeUser = (overrides: Partial<UserFixture> = {}): UserFixture => ({
  id: "u1",
  email: "a@b.com",
  tenantId: TENANT,
  firstName: "Ann",
  passwordHash: "stored-hash",
  emailVerified: true,
  tenant: { name: "Acme", featureFlags: {} },
  ...overrides,
});

function build(user: UserFixture | null = makeUser()) {
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => user),
  };
  const userRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn(async () => user),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => ({ id: "new", ...(v as object) })),
    update: jest.fn(),
  };
  const tenantRepository = { findOne: jest.fn(async () => ({ id: TENANT, active: true })) };
  const sessionRepository = { findOne: jest.fn(), update: jest.fn() };
  const oauthRefreshTokenRepository = { findOne: jest.fn() };
  const loginThrottle = {
    charge: jest.fn(async () => ({ blocked: false })),
    refund: jest.fn(),
  };
  const bruteForce = {
    clearExpiredLock: jest.fn(),
    checkAccountLock: jest.fn(),
    isLocked: jest.fn(() => false),
    recordFailedAttempt: jest.fn(async () => {
      throw new ApiException("AUTH_INVALID_CREDENTIALS");
    }),
    resetFailedAttempts: jest.fn(),
  };
  const securityEvents = { log: jest.fn() };
  const domainEvents = { publish: jest.fn() };
  const emailService = { sendWelcomeEmail: jest.fn(), sendVerificationEmail: jest.fn() };
  const oauthRefresh = { rotateRefreshToken: jest.fn() };
  const passwordEffects = { afterPasswordChange: jest.fn() };
  const mfaService = { getMfaStatus: jest.fn(async () => ({ enabled: true, methods: ["totp"] })) };
  const jwks = { getCurrentSigningKey: jest.fn() };
  const redis = { incr: jest.fn(), extendTTL: jest.fn(), delete: jest.fn() };
  const noop = {};

  // Positional, mirroring the constructor.
  const service = new AuthService(
    userRepository as never,
    sessionRepository as never,
    tenantRepository as never,
    oauthRefreshTokenRepository as never,
    noop as never, // socialConnection
    noop as never, // userRole
    noop as never, // userInvite
    noop as never, // tenantSocialProvider
    { sign: jest.fn(() => "mfa-temp-token") } as never, // jwt
    noop as never, // config
    emailService as never,
    noop as never, // sessionService
    bruteForce as never,
    mfaService as never,
    noop as never, // mfaPolicy
    noop as never, // webauthn
    oauthRefresh as never,
    securityEvents as never,
    jwks as never,
    redis as never,
    loginThrottle as never,
    domainEvents as never,
    passwordEffects as never,
  );
  return {
    service, userRepository, loginThrottle, bruteForce, securityEvents, domainEvents,
    oauthRefresh, oauthRefreshTokenRepository, emailService, tenantRepository, passwordEffects, jwks, queryBuilder,
  };
}

const login = (s: AuthService, email = "a@b.com") =>
  s.login({ ...CTX, email, password: "pw" });

describe("AuthService.login", () => {
  beforeEach(() => {
    verify.mockReset();
    dummy.mockClear();
  });

  it("answers an unknown email with AUTH_INVALID_CREDENTIALS after a dummy hash", async () => {
    const { service } = build(null);
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    expect(dummy).toHaveBeenCalledWith("pw");
    expect(verify).not.toHaveBeenCalled();
  });

  it("answers a wrong password with the same code and no detail", async () => {
    verify.mockResolvedValue(false);
    const { service, bruteForce } = build();
    const err = await login(service).catch((e: unknown) => e);
    expect((err as ApiException).code).toBe("AUTH_INVALID_CREDENTIALS");
    expect((err as ApiException).detail).toBeUndefined();
    expect(bruteForce.recordFailedAttempt).toHaveBeenCalled();
  });

  it("treats a social-only account (no password) like an unknown email", async () => {
    const { service } = build(makeUser({ passwordHash: null }));
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    expect(dummy).toHaveBeenCalled();
  });

  it("a throttled attempt looks like a wrong password, even with the right one, and skips the user lookup", async () => {
    verify.mockResolvedValue(true);
    const { service, loginThrottle, userRepository } = build();
    loginThrottle.charge.mockResolvedValue({ blocked: true });
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(dummy).toHaveBeenCalled();
  });

  it("charges the throttle before checking the password", async () => {
    verify.mockResolvedValue(false);
    const { service, loginThrottle } = build();
    await login(service).catch(() => undefined);
    expect(loginThrottle.charge).toHaveBeenCalledWith(TENANT, "a@b.com", "1.1.1.1");
  });

  it("does not disclose a lock when the password is wrong", async () => {
    verify.mockResolvedValue(false);
    const { service, bruteForce } = build(makeUser({ lockedUntil: new Date(Date.now() + 60_000) }));
    bruteForce.isLocked.mockReturnValue(true);
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    expect(bruteForce.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it("reveals AUTH_ACCOUNT_LOCKED only after the correct password", async () => {
    verify.mockResolvedValue(true);
    const { service, bruteForce, loginThrottle } = build();
    bruteForce.checkAccountLock.mockRejectedValue(new ApiException("AUTH_ACCOUNT_LOCKED"));
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_ACCOUNT_LOCKED" });
    expect(loginThrottle.refund).not.toHaveBeenCalled();
  });

  it("rejects an unverified email only after the password is proven", async () => {
    verify.mockResolvedValue(true);
    const { service } = build(
      makeUser({ emailVerified: false, tenant: { name: "Acme", featureFlags: { emailVerificationRequired: true } } }),
    );
    await expect(login(service)).rejects.toMatchObject({ code: "AUTH_EMAIL_NOT_VERIFIED" });
  });

  it("refunds the email charge and resets failures on success", async () => {
    verify.mockResolvedValue(true);
    const { service, loginThrottle, bruteForce, jwks } = build();
    jwks.getCurrentSigningKey.mockResolvedValue({ kid: "k", privateKey: { export: () => "pem" } });
    await login(service);
    expect(loginThrottle.refund).toHaveBeenCalledWith(TENANT, "a@b.com");
    expect(bruteForce.resetFailedAttempts).toHaveBeenCalled();
  });
});

describe("AuthService.register", () => {
  const data = { tenantId: TENANT, email: "a@b.com", password: "correct horse battery", ip: "i", userAgent: "ua" };

  it("returns the same response shape whether or not the email is taken", async () => {
    const taken = build(makeUser());
    const free = build(null);
    const takenResponse = await taken.service.register(data);
    const freeResponse = await free.service.register(data);
    expect(Object.keys(takenResponse).sort()).toEqual(Object.keys(freeResponse).sort());
    expect(takenResponse.message).toBe(freeResponse.message);
    expect(taken.userRepository.save).not.toHaveBeenCalled();
    expect(free.userRepository.save).toHaveBeenCalled();
  });

  it("rejects a weak password with PASSWORD_POLICY before touching the database", async () => {
    const { service, userRepository } = build(null);
    await expect(service.register({ ...data, password: "short" })).rejects.toMatchObject({
      code: "PASSWORD_POLICY",
    });
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});

describe("AuthService.resendVerification / forgotPassword", () => {
  it("is silent for an already verified account", async () => {
    const { service, emailService } = build(makeUser({ emailVerified: true }));
    await expect(service.resendVerification(TENANT, "a@b.com")).resolves.toBeUndefined();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("is silent for an unknown email", async () => {
    const { service } = build(null);
    await expect(service.resendVerification(TENANT, "x@y.com")).resolves.toBeUndefined();
    await expect(service.forgotPassword(TENANT, "x@y.com", "1.1.1.1")).resolves.toBeUndefined();
  });
});

describe("AuthService.refreshToken reuse detection", () => {
  it("publishes SESSION_REFRESH_REUSE_DETECTED so the owner is emailed", async () => {
    const ctx = build();
    ctx.oauthRefresh.rotateRefreshToken.mockRejectedValue(new ApiException("AUTH_REFRESH_REUSED"));
    ctx.oauthRefreshTokenRepository.findOne.mockResolvedValue({ id: "t", userId: "u1" });

    await expect(ctx.service.refreshToken(TENANT, "raw", "9.9.9.9", "ua", "req-7")).rejects.toMatchObject({
      code: "AUTH_REFRESH_REUSED",
    });

    expect(ctx.domainEvents.publish).toHaveBeenCalledWith(
      DomainEventName.SESSION_REFRESH_REUSE_DETECTED,
      expect.objectContaining({
        tenantId: TENANT, userId: "u1", email: "a@b.com", ip: "9.9.9.9", requestId: "req-7", tenantName: "Acme",
      }),
    );
  });

  it("does not publish for ordinary refresh failures", async () => {
    const ctx = build();
    ctx.oauthRefresh.rotateRefreshToken.mockRejectedValue(new ApiException("AUTH_TOKEN_INVALID"));
    await expect(ctx.service.refreshToken(TENANT, "raw", "i", "ua")).rejects.toMatchObject({
      code: "AUTH_TOKEN_INVALID",
    });
    expect(ctx.domainEvents.publish).not.toHaveBeenCalled();
  });

  it("still surfaces the original error when publishing fails", async () => {
    const ctx = build();
    ctx.oauthRefresh.rotateRefreshToken.mockRejectedValue(new ApiException("AUTH_REFRESH_REUSED"));
    ctx.oauthRefreshTokenRepository.findOne.mockRejectedValue(new Error("db"));
    await expect(ctx.service.refreshToken(TENANT, "raw", "i", "ua")).rejects.toMatchObject({
      code: "AUTH_REFRESH_REUSED",
    });
  });
});

describe("AuthService.resetPassword", () => {
  it("answers a wrong or expired code with AUTH_OTP_INVALID", async () => {
    const { service } = build(null);
    await expect(service.resetPassword(TENANT, "a@b.com", "123456", "correct horse battery")).rejects.toMatchObject({
      code: "AUTH_OTP_INVALID",
    });
  });
});

import { RateLimitGuard } from "./rate-limit.guard";
import { Reflector } from "@nestjs/core";
import { ExecutionContext, HttpException } from "@nestjs/common";
import { RedisService } from "@/common/service/redis.service";

const mockIsAllowed = jest.fn();

jest.mock("@repo/security", () => ({
  SlidingWindowRateLimiter: jest.fn().mockImplementation(() => ({
    isAllowed: mockIsAllowed,
  })),
}));

function createMockContext(overrides?: {
  handler?: () => void;
  ip?: string;
  path?: string;
  user?: { sub: string };
}): ExecutionContext {
  const req = {
    ip: overrides?.ip ?? "127.0.0.1",
    path: overrides?.path ?? "/auth/login",
    user: overrides?.user,
  };
  const res = {
    setHeader: jest.fn(),
  };

  return {
    getHandler: () => overrides?.handler ?? (() => {}),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;
  let reflector: Reflector;
  let redisService: RedisService;

  beforeEach(() => {
    reflector = { get: jest.fn() } as unknown as Reflector;
    redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    guard = new RateLimitGuard(reflector, redisService);
    mockIsAllowed.mockReset();
  });

  it("allows request when no rate limit config is set on handler", async () => {
    (reflector.get as jest.Mock).mockReturnValue(undefined);
    const ctx = createMockContext();
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it("allows request when under the rate limit", async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      max: 5,
      windowMs: 900000,
      keyBy: "ip",
    });
    mockIsAllowed.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date("2026-01-01T00:15:00Z"),
    });

    const ctx = createMockContext();
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);

    const res = ctx.switchToHttp().getResponse();
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 5);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 4);
  });

  it("throws 429 when rate limit exceeded", async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      max: 5,
      windowMs: 900000,
      keyBy: "ip",
    });
    mockIsAllowed.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date("2026-01-01T00:15:00Z"),
      retryAfter: 120,
    });

    const ctx = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 429,
    });

    const res = ctx.switchToHttp().getResponse();
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 120);
  });

  it("uses user ID as key when keyBy is 'user' and user is present", async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      max: 5,
      windowMs: 300000,
      keyBy: "user",
    });
    mockIsAllowed.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date("2026-01-01T00:05:00Z"),
    });

    const ctx = createMockContext({
      user: { sub: "user-123" },
      path: "/mfa/verify/totp",
    });
    await guard.canActivate(ctx);

    expect(mockIsAllowed).toHaveBeenCalledWith(
      "user-123:/mfa/verify/totp",
      expect.objectContaining({ maxRequests: 5, windowMs: 300000 }),
    );
  });

  it("falls back to IP when keyBy is 'user' but no user present", async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      max: 5,
      windowMs: 300000,
      keyBy: "user",
    });
    mockIsAllowed.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date("2026-01-01T00:05:00Z"),
    });

    const ctx = createMockContext({ ip: "10.0.0.1", path: "/auth/login" });
    await guard.canActivate(ctx);

    expect(mockIsAllowed).toHaveBeenCalledWith(
      "10.0.0.1:/auth/login",
      expect.objectContaining({ maxRequests: 5 }),
    );
  });
});

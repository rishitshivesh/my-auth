import * as crypto from "crypto";
import {
  EmailOtpService,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_SECONDS,
} from "./email-otp.service";
import type { EmailService } from "@/modules/email/email.service";
import type { UserService } from "@/modules/user/user.service";
import type { RedisService } from "@/common/service/redis.service";

/** Minimal in-memory stand-in for RedisService's tenant-scoped API. */
class FakeRedis {
  store = new Map<string, unknown>();
  ttls = new Map<string, number>();
  private key = (t: string, r: string, id: string) => `${t}:${r}:${id}`;
  async set(t: string, r: string, id: string, v: unknown, ttl?: number) {
    this.store.set(this.key(t, r, id), v);
    if (ttl) this.ttls.set(this.key(t, r, id), ttl);
  }
  async get<T>(t: string, r: string, id: string): Promise<T | null> {
    return (this.store.get(this.key(t, r, id)) as T) ?? null;
  }
  async delete(t: string, r: string, id: string) {
    this.store.delete(this.key(t, r, id));
  }
  async incr(t: string, r: string, id: string) {
    const k = this.key(t, r, id);
    const n = ((this.store.get(k) as number) ?? 0) + 1;
    this.store.set(k, n);
    return n;
  }
  async extendTTL(t: string, r: string, id: string, ttl: number) {
    this.ttls.set(this.key(t, r, id), ttl);
  }
}

describe("EmailOtpService (Redis-backed)", () => {
  const user = { id: "u1", email: "u@example.com", tenantId: "t1" };
  let redis: FakeRedis;
  let sentCode: string;
  let service: EmailOtpService;

  beforeEach(() => {
    redis = new FakeRedis();
    sentCode = "";
    const email = {
      sendOTPEmail: jest.fn(async (_u: unknown, code: string) => {
        sentCode = code;
        return true;
      }),
    } as unknown as EmailService;
    const users = { findById: jest.fn().mockResolvedValue(user) } as unknown as UserService;
    service = new EmailOtpService(email, users, redis as unknown as RedisService);
  });

  it("stores only a hash of a 6-digit code with a TTL", async () => {
    await service.sendOtp("u1", "t1");

    expect(sentCode).toMatch(/^\d{6}$/);
    const stored = await redis.get<string>("t1", "email-otp", "u1");
    expect(stored).toBe(crypto.createHash("sha256").update(sentCode).digest("hex"));
    expect(redis.ttls.get("t1:email-otp:u1")).toBe(EMAIL_OTP_TTL_SECONDS);
  });

  it("verifies the correct code exactly once", async () => {
    await service.sendOtp("u1", "t1");

    await expect(service.verifyOtp("u1", "t1", sentCode)).resolves.toBe(true);
    await expect(service.verifyOtp("u1", "t1", sentCode)).resolves.toBe(false);
  });

  it("is shared across service instances (replicas)", async () => {
    await service.sendOtp("u1", "t1");
    const replica = new EmailOtpService(
      {} as EmailService,
      {} as UserService,
      redis as unknown as RedisService,
    );

    await expect(replica.verifyOtp("u1", "t1", sentCode)).resolves.toBe(true);
  });

  it("destroys the code after the attempt budget is exhausted", async () => {
    await service.sendOtp("u1", "t1");
    const wrong = sentCode === "000000" ? "111111" : "000000";

    for (let i = 0; i < EMAIL_OTP_MAX_ATTEMPTS; i++) {
      await expect(service.verifyOtp("u1", "t1", wrong)).resolves.toBe(false);
    }
    await expect(service.verifyOtp("u1", "t1", sentCode)).resolves.toBe(false);
    expect(await redis.get("t1", "email-otp", "u1")).toBeNull();
  });

  it("a new code resets the attempt budget", async () => {
    await service.sendOtp("u1", "t1");
    for (let i = 0; i < EMAIL_OTP_MAX_ATTEMPTS - 1; i++) {
      await service.verifyOtp("u1", "t1", "999999x");
    }
    await service.sendOtp("u1", "t1");

    await expect(service.verifyOtp("u1", "t1", sentCode)).resolves.toBe(true);
  });

  it("does not leak codes across tenants", async () => {
    await service.sendOtp("u1", "t1");
    await expect(service.verifyOtp("u1", "t2", sentCode)).resolves.toBe(false);
  });
});

import { Injectable, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { EmailService } from "@/modules/email/email.service";
import { UserService } from "@/modules/user/user.service";
import { RedisService } from "@/common/service/redis.service";
import { logger } from "@/common/logger";

/** Six-digit codes, valid for 10 minutes, at most 5 verification attempts. */
export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_SECONDS = 10 * 60;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

const CODE_RESOURCE = "email-otp";
const ATTEMPTS_RESOURCE = "email-otp-attempts";

/**
 * Email one-time codes for MFA.
 *
 * State lives in Redis (keyed per tenant + user) so codes survive restarts
 * and work across replicas. The previous implementation kept codes in a
 * process-local Map, so a code sent by one replica could not be verified by
 * another, and every restart invalidated outstanding codes.
 *
 * Only a SHA-256 hash of the code is stored; comparison is constant-time.
 */
@Injectable()
export class EmailOtpService {
  constructor(
    private readonly emailService: EmailService,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
  ) {}

  /** Generate a code, store its hash, reset the attempt budget, and email it. */
  async sendOtp(userId: string, tenantId: string): Promise<void> {
    const user = await this.userService.findById(tenantId, userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const code = crypto
      .randomInt(0, 10 ** EMAIL_OTP_LENGTH)
      .toString()
      .padStart(EMAIL_OTP_LENGTH, "0");

    await this.redisService.set(
      tenantId,
      CODE_RESOURCE,
      userId,
      EmailOtpService.hash(code),
      EMAIL_OTP_TTL_SECONDS,
    );
    await this.redisService.delete(tenantId, ATTEMPTS_RESOURCE, userId);

    await this.emailService.sendOTPEmail(user, code);
    logger.info({ userId }, "Email OTP sent");
  }

  /**
   * Verify a code. Returns false for unknown, expired or wrong codes.
   * After EMAIL_OTP_MAX_ATTEMPTS wrong guesses the code is destroyed.
   * A correct code is consumed (single use).
   */
  async verifyOtp(userId: string, tenantId: string, code: string): Promise<boolean> {
    const storedHash = await this.redisService.get<string>(tenantId, CODE_RESOURCE, userId);
    if (!storedHash) {
      logger.warn({ userId }, "Email OTP not found or expired");
      return false;
    }

    const attempts = await this.redisService.incr(tenantId, ATTEMPTS_RESOURCE, userId);
    if (attempts === 1) {
      await this.redisService.extendTTL(
        tenantId,
        ATTEMPTS_RESOURCE,
        userId,
        EMAIL_OTP_TTL_SECONDS,
      );
    }
    if (attempts > EMAIL_OTP_MAX_ATTEMPTS) {
      await this.invalidate(tenantId, userId);
      logger.warn({ userId, attempts }, "Email OTP attempt budget exhausted — code destroyed");
      return false;
    }

    if (!EmailOtpService.matches(code, storedHash)) {
      logger.warn({ userId, attempts }, "Invalid email OTP");
      return false;
    }

    await this.invalidate(tenantId, userId);
    logger.info({ userId }, "Email OTP verified");
    return true;
  }

  private async invalidate(tenantId: string, userId: string): Promise<void> {
    await this.redisService.delete(tenantId, CODE_RESOURCE, userId);
    await this.redisService.delete(tenantId, ATTEMPTS_RESOURCE, userId);
  }

  private static hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private static matches(code: string, storedHash: string): boolean {
    if (!/^\d+$/.test(code)) return false;
    const presented = Buffer.from(EmailOtpService.hash(code), "hex");
    const stored = Buffer.from(storedHash, "hex");
    return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
  }
}

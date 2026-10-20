import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { User, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { logger } from "@/common/logger";
import { EmailService } from "@/modules/email/email.service";

@Injectable()
export class BruteForceService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly securityEventService: SecurityEventService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Check if account is currently locked.
   * Call only AFTER the password was verified: the lock state must not be
   * visible to someone who does not know the password (it would reveal that
   * the account exists).
   * @throws ApiException AUTH_ACCOUNT_LOCKED if account is locked
   */
  async checkAccountLock(user: User): Promise<void> {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );

      logger.info({ userId: user.id, minutesLeft }, "Account locked for user");

      throw new ApiException("AUTH_ACCOUNT_LOCKED", {
        detail: `Too many failed sign-in attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
      });
    }

    await this.clearExpiredLock(user);
  }

  /** True while a lock is in force. */
  isLocked(user: User): boolean {
    return !!user.lockedUntil && user.lockedUntil > new Date();
  }

  /** Clears an expired lock so the failure counter starts fresh. */
  async clearExpiredLock(user: User): Promise<void> {
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      user.lockedUntil = undefined;
      user.failedLoginAttempts = 0;
      await this.userRepository.save(user);
      logger.info({ userId: user.id }, "Account lock expired, resetting");
    }
  }

  /**
   * Record a failed login attempt
   * Implements account lockout. No per-attempt delay: it would take longer for
   * existing accounts than unknown ones and so reveal which emails exist;
   * LoginThrottleService limits attempt rate instead.
   */
  async recordFailedAttempt(
    user: User,
    tenantId: string,
    ipAddress?: string,
  ): Promise<void> {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();

    logger.warn({ userId: user.id, attempts: user.failedLoginAttempts, maxAttempts: this.MAX_ATTEMPTS }, "Failed login attempt");

    // Emit brute-force threshold event when approaching the lockout limit
    // (fires one attempt before the final lock so analysts see the build-up)
    if (user.failedLoginAttempts === this.MAX_ATTEMPTS - 1) {
      this.securityEventService.log({
        userId: user.id,
        tenantId,
        actorEmail: user.email,
        eventType: SecurityEventType.BRUTE_FORCE_THRESHOLD,
        severity: "warning",
        ipAddress: ipAddress ?? "0.0.0.0",
        userAgent: "system",
        metadata: {
          attempts: user.failedLoginAttempts,
          maxAttempts: this.MAX_ATTEMPTS,
          attemptsUntilLock: 1,
        },
      });
    }

    // Lock account after max attempts
    if (user.failedLoginAttempts >= this.MAX_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
      await this.userRepository.save(user);

      logger.warn({ userId: user.id, lockedUntil: user.lockedUntil }, "Account locked due to too many failed attempts");

      this.securityEventService.log({
        userId: user.id,
        tenantId,
        actorEmail: user.email,
        eventType: SecurityEventType.USER_LOCKED,
        severity: "critical",
        ipAddress: ipAddress ?? "0.0.0.0",
        userAgent: "system",
        metadata: {
          attempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
        },
      });

      // Queued, never throws: a mail outage must not change the lockout response.
      await this.emailService.sendAccountLockedEmail(
        user,
        this.LOCKOUT_DURATION / 60000,
        { ipAddress },
      );

      // Same answer as any wrong password: the lock is only disclosed (by
      // checkAccountLock) to someone who then proves they know the password.
      throw new ApiException("AUTH_INVALID_CREDENTIALS");
    }

    // Save failed attempt count
    await this.userRepository.save(user);

    // Never disclose the remaining attempts: unknown emails have none.
    throw new ApiException("AUTH_INVALID_CREDENTIALS");
  }

  /**
   * Reset failed login attempts on successful login
   */
  async resetFailedAttempts(user: User): Promise<void> {
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      logger.info({ userId: user.id }, "Resetting failed login attempts");

      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      user.lastFailedLogin = null;

      await this.userRepository.save(user);
    }
  }

  /**
   * Manually unlock account (admin function)
   */
  async unlockAccount(userId: string, tenantId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND", { detail: "User not found." });
    }

    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    user.lastFailedLogin = null;

    await this.userRepository.save(user);

    logger.info({ userId: user.id }, "Account manually unlocked");
  }

  /**
   * Get account status
   */
  async getAccountStatus(userId: string, tenantId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      select: [
        "id",
        "email",
        "failedLoginAttempts",
        "lockedUntil",
        "lastFailedLogin",
      ],
    });

    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND", { detail: "User not found." });
    }

    const isLocked = user.lockedUntil && user.lockedUntil > new Date();
    const minutesUntilUnlock = isLocked
      ? Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60000)
      : 0;

    return {
      isLocked,
      failedAttempts: user.failedLoginAttempts || 0,
      maxAttempts: this.MAX_ATTEMPTS,
      attemptsRemaining: Math.max(
        0,
        this.MAX_ATTEMPTS - (user.failedLoginAttempts || 0),
      ),
      lockedUntil: user.lockedUntil,
      minutesUntilUnlock,
      lastFailedLogin: user.lastFailedLogin,
    };
  }
}

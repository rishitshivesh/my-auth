import { Injectable, Optional } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { User, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { logger } from "@/common/logger";
import { EmailService } from "@/modules/email/email.service";
import { PLATFORM_PASSWORD_POLICY, TenantPasswordPolicyService } from "@/modules/password-policy/tenant-password-policy.service";

@Injectable()
export class BruteForceService {
  /** Platform defaults; a tenant's password policy may override them (see lockoutFor). */
  private readonly MAX_ATTEMPTS = PLATFORM_PASSWORD_POLICY.lockoutThreshold;
  private readonly LOCKOUT_DURATION = PLATFORM_PASSWORD_POLICY.lockoutDurationMinutes * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly securityEventService: SecurityEventService,
    private readonly emailService: EmailService,
    @Optional() private readonly passwordPolicy?: TenantPasswordPolicyService,
  ) {}

  private async lockoutFor(tenantId: string): Promise<{ maxAttempts: number; durationMs: number }> {
    if (!this.passwordPolicy) return { maxAttempts: this.MAX_ATTEMPTS, durationMs: this.LOCKOUT_DURATION };
    const policy = await this.passwordPolicy.get(tenantId);
    return { maxAttempts: policy.lockoutThreshold, durationMs: policy.lockoutDurationMinutes * 60 * 1000 };
  }

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
    const { maxAttempts, durationMs } = await this.lockoutFor(tenantId);
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();

    logger.warn({ userId: user.id, attempts: user.failedLoginAttempts, maxAttempts: maxAttempts }, "Failed login attempt");

    // Emit brute-force threshold event when approaching the lockout limit
    // (fires one attempt before the final lock so analysts see the build-up)
    if (user.failedLoginAttempts === maxAttempts - 1) {
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
          maxAttempts: maxAttempts,
          attemptsUntilLock: 1,
        },
      });
    }

    // Lock account after max attempts
    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + durationMs);
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
        durationMs / 60000,
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

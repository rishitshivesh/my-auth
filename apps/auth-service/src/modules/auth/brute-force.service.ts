import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { User, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { logger } from "@/common/logger";

@Injectable()
export class BruteForceService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms
  private readonly PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // Delays in ms

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly securityEventService: SecurityEventService,
  ) {}

  /**
   * Check if account is currently locked
   * @throws UnauthorizedException if account is locked
   */
  async checkAccountLock(user: User): Promise<void> {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );

      logger.info({ userId: user.id, minutesLeft }, "Account locked for user");

      throw new UnauthorizedException({
        message: `Account temporarily locked due to too many failed login attempts`,
        lockedUntil: user.lockedUntil,
        minutesRemaining: minutesLeft,
        statusCode: 423, // 423 Locked
      });
    }

    // Clear lock if expired
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      user.lockedUntil = undefined;
      user.failedLoginAttempts = 0;
      await this.userRepository.save(user);
      logger.info({ userId: user.id }, "Account lock expired, resetting");
    }
  }

  /**
   * Record a failed login attempt
   * Implements progressive delays and account lockout
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

      // TODO: Send email notification about account lock
      // await this.emailService.sendAccountLockedEmail(user);

      throw new UnauthorizedException({
        message: `Account locked due to too many failed login attempts. Try again in 15 minutes.`,
        lockedUntil: user.lockedUntil,
        statusCode: 423,
      });
    }

    // Save failed attempt count
    await this.userRepository.save(user);

    // Apply progressive delay (prevents brute force timing attacks)
    const delayIndex = Math.min(
      user.failedLoginAttempts - 1,
      this.PROGRESSIVE_DELAYS.length - 1,
    );
    const delay = this.PROGRESSIVE_DELAYS[delayIndex] as number;

    if (delay > 0) {
      logger.info({ delayMs: delay }, "Applying progressive delay for failed attempt");
      await this.sleep(delay);
    }

    // Throw error after delay
    const attemptsLeft = this.MAX_ATTEMPTS - user.failedLoginAttempts;
    throw new UnauthorizedException({
      message: "Invalid email or password",
      attemptsRemaining: attemptsLeft,
    });
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
      throw new Error("User not found");
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
      throw new Error("User not found");
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

  /**
   * Helper: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

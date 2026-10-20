import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "@/common/service/redis.service";
import { logger } from "@/common/logger";
import { emailBucketKey } from "./email-key";

const DEFAULT_EMAIL_LIMIT = 10;
const DEFAULT_IP_LIMIT = 30;
const DEFAULT_WINDOW_SECONDS = 900;
const UNKNOWN_IP = "unknown";

/**
 * Login throttle keyed by hashed folded email AND ip. Once over either limit,
 * further attempts are refused as if the credentials were wrong (even with the
 * right password), so an attacker cannot tell the block from a normal failure.
 *
 * Every attempt is charged BEFORE the password is checked and refunded only
 * if the password turns out right; checking first and recording after the
 * slow hash would let a burst of parallel guesses all pass the check.
 */
@Injectable()
export class LoginThrottleService {
  private readonly emailLimit: number;
  private readonly ipLimit: number;
  private readonly windowSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.emailLimit = config.get<number>("LOGIN_THROTTLE_EMAIL_LIMIT", DEFAULT_EMAIL_LIMIT);
    this.ipLimit = config.get<number>("LOGIN_THROTTLE_IP_LIMIT", DEFAULT_IP_LIMIT);
    this.windowSeconds = config.get<number>("LOGIN_THROTTLE_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS);
    this.keyPrefix = `${config.get<string>("REDIS_KEY_PREFIX", "sentry")}:throttle:`;
  }

  /** Counts this attempt and says whether it may proceed. */
  async charge(tenantId: string, email: string, ip: string | null): Promise<{ blocked: boolean }> {
    try {
      const [byEmail, byIp] = await Promise.all([
        this.hit(this.emailKey(tenantId, email)),
        this.hit(this.ipKey(tenantId, ip)),
      ]);
      const emailBlocked = byEmail > this.emailLimit;
      const blocked = emailBlocked || byIp > this.ipLimit;
      if (blocked) {
        // The email is never logged.
        logger.warn({ ip, tenantId, byEmail: emailBlocked }, "Login throttled");
      }
      return { blocked };
    } catch (err: unknown) {
      // A Redis outage must not lock everyone out; the per-account lockout still applies.
      logger.error({ err }, "Login throttle unavailable, allowing attempt");
      return { blocked: false };
    }
  }

  /** The password was right: the email's charges are forgiven. The IP keeps its count. */
  async refund(tenantId: string, email: string): Promise<void> {
    try {
      await this.redis.getClient().del(this.emailKey(tenantId, email));
    } catch (err: unknown) {
      logger.error({ err }, "Login throttle refund failed");
    }
  }

  private async hit(key: string): Promise<number> {
    const client = this.redis.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.windowSeconds);
    }
    return count;
  }

  private emailKey(tenantId: string, email: string): string {
    return this.keyPrefix + emailBucketKey(`login:${tenantId}`, email);
  }

  private ipKey(tenantId: string, ip: string | null): string {
    return `${this.keyPrefix}login:${tenantId}:ip:${ip ?? UNKNOWN_IP}`;
  }
}

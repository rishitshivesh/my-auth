import { Redis } from "ioredis";

/**
 * Sliding Window Rate Limiter
 *
 * Implements a distributed rate limiter using Redis sorted sets.
 * More accurate than fixed window and prevents burst attacks.
 */

export interface RateLimitConfig {
  maxRequests: number; // Maximum requests allowed
  windowMs: number; // Time window in milliseconds
  keyPrefix?: string; // Redis key prefix
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until next attempt
}

export class SlidingWindowRateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Check if request is allowed under rate limit
   * @param identifier - Unique identifier (IP, user ID, etc.)
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  async isAllowed(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const key = `${config.keyPrefix || "rate_limit"}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    pipeline.zcard(key);

    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiry on the key
    pipeline.expire(key, Math.ceil(config.windowMs / 1000));

    const results = await pipeline.exec();

    if (!results) {
      throw new Error("Redis pipeline execution failed");
    }

    // Get count from the second command (zcard)
    const count = ((results[1] as any)[1] as number) || 0;

    const allowed = count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count - 1);

    let retryAfter: number | undefined;
    if (!allowed) {
      // Get the oldest request timestamp
      const oldest = await this.redis.zrange(key, 0, 0, "WITHSCORES");
      if (oldest.length >= 2) {
        const oldestTimestamp = parseInt(oldest[1] as string);
        const resetTime = oldestTimestamp + config.windowMs;
        retryAfter = Math.ceil((resetTime - now) / 1000);
      }
    }

    return {
      allowed,
      remaining,
      resetAt: new Date(now + config.windowMs),
      retryAfter,
    };
  }

  /**
   * Reset rate limit for an identifier
   * @param identifier - Unique identifier
   * @param keyPrefix - Redis key prefix
   */
  async reset(
    identifier: string,
    keyPrefix: string = "rate_limit",
  ): Promise<void> {
    const key = `${keyPrefix}:${identifier}`;
    await this.redis.del(key);
  }

  /**
   * Get current usage for an identifier
   * @param identifier - Unique identifier
   * @param config - Rate limit configuration
   * @returns Current request count
   */
  async getUsage(identifier: string, config: RateLimitConfig): Promise<number> {
    const key = `${config.keyPrefix || "rate_limit"}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    await this.redis.zremrangebyscore(key, 0, windowStart);
    return await this.redis.zcard(key);
  }
}

/**
 * Token Bucket Rate Limiter
 *
 * Allows bursts of traffic while maintaining average rate.
 * Useful for API rate limiting with some flexibility.
 */
export class TokenBucketRateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Check if request is allowed and consume token
   * @param identifier - Unique identifier
   * @param bucketSize - Maximum tokens in bucket
   * @param refillRate - Tokens added per second
   * @param cost - Tokens consumed per request (default: 1)
   * @returns Rate limit result
   */
  async consume(
    identifier: string,
    bucketSize: number,
    refillRate: number,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    const key = `token_bucket:${identifier}`;
    const now = Date.now();

    const data = await this.redis.get(key);
    let tokens = bucketSize;
    let lastRefill = now;

    if (data) {
      const parsed = JSON.parse(data);
      tokens = parsed.tokens;
      lastRefill = parsed.lastRefill;

      // Calculate tokens to add based on time elapsed
      const timePassed = (now - lastRefill) / 1000; // seconds
      const tokensToAdd = timePassed * refillRate;
      tokens = Math.min(bucketSize, tokens + tokensToAdd);
    }

    const allowed = tokens >= cost;
    let remaining = tokens;

    if (allowed) {
      remaining = tokens - cost;
      await this.redis.setex(
        key,
        Math.ceil(bucketSize / refillRate) + 60, // TTL
        JSON.stringify({
          tokens: remaining,
          lastRefill: now,
        }),
      );
    }

    const resetAt = new Date(
      now + ((bucketSize - remaining) / refillRate) * 1000,
    );
    const retryAfter = allowed
      ? undefined
      : Math.ceil((cost - tokens) / refillRate);

    return {
      allowed,
      remaining: Math.floor(remaining),
      resetAt,
      retryAfter,
    };
  }

  /**
   * Reset token bucket for an identifier
   * @param identifier - Unique identifier
   */
  async reset(identifier: string): Promise<void> {
    await this.redis.del(`token_bucket:${identifier}`);
  }
}

/**
 * Distributed Leaky Bucket Rate Limiter
 *
 * Processes requests at a constant rate, queuing excess requests.
 * Best for smoothing out traffic spikes.
 */
export class LeakyBucketRateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Check if request can be processed
   * @param identifier - Unique identifier
   * @param capacity - Maximum bucket capacity
   * @param leakRate - Requests processed per second
   * @returns Rate limit result
   */
  async isAllowed(
    identifier: string,
    capacity: number,
    leakRate: number,
  ): Promise<RateLimitResult> {
    const key = `leaky_bucket:${identifier}`;
    const now = Date.now();

    const data = await this.redis.get(key);
    let level = 0;
    let lastLeak = now;

    if (data) {
      const parsed = JSON.parse(data);
      level = parsed.level;
      lastLeak = parsed.lastLeak;

      // Calculate how much leaked since last check
      const timePassed = (now - lastLeak) / 1000; // seconds
      const leaked = timePassed * leakRate;
      level = Math.max(0, level - leaked);
    }

    const allowed = level < capacity;

    if (allowed) {
      level += 1;
      await this.redis.setex(
        key,
        Math.ceil(capacity / leakRate) + 60, // TTL
        JSON.stringify({
          level,
          lastLeak: now,
        }),
      );
    }

    const remaining = Math.floor(capacity - level);
    const resetAt = new Date(now + (level / leakRate) * 1000);
    const retryAfter = allowed
      ? undefined
      : Math.ceil((level - capacity + 1) / leakRate);

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter,
    };
  }

  /**
   * Reset leaky bucket for an identifier
   * @param identifier - Unique identifier
   */
  async reset(identifier: string): Promise<void> {
    await this.redis.del(`leaky_bucket:${identifier}`);
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { logger } from "@/common/logger";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private keyPrefix: string;

  constructor(private configService: ConfigService) {
    this.keyPrefix =
      this.configService.get("REDIS_KEY_PREFIX", "sentry") + ":";
  }

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD") || undefined,
      db: this.configService.get("REDIS_DB", 0),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on("connect", () => {
      logger.info("Redis connected");
    });

    this.client.on("error", (err) => {
      logger.error({ err }, "Redis error");
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Build tenant-scoped key
   * Format: sentry:t:{tenantId}:{resource}:{identifier}
   */
  private buildKey(
    tenantId: string,
    resource: string,
    identifier: string,
  ): string {
    return `${this.keyPrefix}t:${tenantId}:${resource}:${identifier}`;
  }

  /**
   * Set value with optional TTL
   */
  async set(
    tenantId: string,
    resource: string,
    identifier: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const key = this.buildKey(tenantId, resource, identifier);
    const serialized = JSON.stringify(value);

    if (ttl) {
      await this.client.setex(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Get value
   */
  async get<T>(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<T | null> {
    const key = this.buildKey(tenantId, resource, identifier);
    const value = await this.client.get(key);

    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Delete value
   */
  async delete(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<void> {
    const key = this.buildKey(tenantId, resource, identifier);
    await this.client.del(key);
  }

  /**
   * Delete a key and report whether this call removed it. DEL is atomic, so
   * exactly one concurrent caller gets `true` (one-time-use tokens).
   */
  async consumeOnce(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<boolean> {
    const key = this.buildKey(tenantId, resource, identifier);
    return (await this.client.del(key)) === 1;
  }

  /**
   * Set only when the key does not exist; true for exactly one concurrent caller
   * (atomic SET NX). Used to claim a one-time link.
   */
  async setIfAbsent(
    tenantId: string,
    resource: string,
    identifier: string,
    value: unknown,
    ttl: number,
  ): Promise<boolean> {
    const key = this.buildKey(tenantId, resource, identifier);
    return (await this.client.set(key, JSON.stringify(value), "EX", ttl, "NX")) === "OK";
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(tenantId: string, pattern: string): Promise<number> {
    const fullPattern = `${this.keyPrefix}t:${tenantId}:${pattern}`;
    const keys = await this.client.keys(fullPattern);

    if (keys.length === 0) return 0;

    return await this.client.del(...keys);
  }

  /**
   * Check if key exists
   */
  async exists(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<boolean> {
    const key = this.buildKey(tenantId, resource, identifier);
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get TTL (time to live) in seconds
   */
  async getTTL(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<number> {
    const key = this.buildKey(tenantId, resource, identifier);
    return await this.client.ttl(key);
  }

  /**
   * Extend TTL
   */
  async extendTTL(
    tenantId: string,
    resource: string,
    identifier: string,
    ttl: number,
  ): Promise<void> {
    const key = this.buildKey(tenantId, resource, identifier);
    await this.client.expire(key, ttl);
  }

  /**
   * Increment integer counter and return new value
   */
  async incr(
    tenantId: string,
    resource: string,
    identifier: string,
  ): Promise<number> {
    const key = this.buildKey(tenantId, resource, identifier);
    return this.client.incr(key);
  }

  /**
   * Set expiry as an absolute Unix timestamp (seconds since epoch)
   */
  async expireAtTimestamp(
    tenantId: string,
    resource: string,
    identifier: string,
    unixTimestamp: number,
  ): Promise<void> {
    const key = this.buildKey(tenantId, resource, identifier);
    await this.client.expireat(key, unixTimestamp);
  }

  /**
   * Read multiple daily api_call counters for a tenant.
   * Returns counts in the same order as the provided dates array.
   */
  async getDailyApiCallCounts(
    tenantId: string,
    dates: string[],
  ): Promise<number[]> {
    if (dates.length === 0) return [];
    const keys = dates.map((date) =>
      this.buildKey(tenantId, "api_calls", date),
    );
    const values = await this.client.mget(...keys);
    return values.map((v) => (v ? parseInt(v, 10) : 0));
  }
}

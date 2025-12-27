import { Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { CacheTTL } from "@/common/constants/cache";

type RedisConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

@Injectable()
export class RedisCacheService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(RedisCacheService.getConfig());
  }

  static getConfig() {
    const config: RedisConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    };
    if (process.env.REDIS_USERNAME) {
      config.username = process.env.REDIS_USERNAME;
    }

    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    return config;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: unknown, ttlSeconds = CacheTTL.threeDays) {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async update(key: string, value: unknown) {
    await this.redis.set(key, JSON.stringify(value), "KEEPTTL");
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async flush() {
    await this.redis.flushall();
  }

  async deleteByPattern(pattern: string): Promise<string[]> {
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
    return keys;
  }
}

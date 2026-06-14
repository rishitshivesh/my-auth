import { SetMetadata } from "@nestjs/common";

export interface RateLimitConfig {
  max: number;
  windowMs: number;
  keyBy: "ip" | "user";
}

export const RATE_LIMIT_KEY = "rate_limit";

export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

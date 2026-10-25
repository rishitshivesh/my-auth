import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import Redis from "ioredis";
import { REPO_ROOT, TEST_REDIS_DB, TEST_REDIS_PREFIX } from "../harness/config";

function redisOptions() {
  const dev = fs.existsSync(path.join(REPO_ROOT, ".env")) ? dotenv.parse(fs.readFileSync(path.join(REPO_ROOT, ".env"))) : {};
  return {
    host: process.env["E2E_REDIS_HOST"] ?? dev["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["E2E_REDIS_PORT"] ?? dev["REDIS_PORT"] ?? 6379),
    password: process.env["E2E_REDIS_PASSWORD"] ?? (dev["REDIS_PASSWORD"] || undefined),
    db: TEST_REDIS_DB,
  };
}

/**
 * Deletes rate-limit and login-throttle keys on the dedicated test index (DB 15) only. A browser
 * run shares one IP, so the service's real per-IP limits (magic link 3/h, register 3/h) would
 * otherwise couple unrelated journeys. Never FLUSHALL, never touches another database.
 */
export async function clearRateLimits(): Promise<void> {
  const redis = new Redis(redisOptions());
  try {
    if (redis.options.db !== TEST_REDIS_DB) throw new Error("Refusing to touch a Redis index other than 15");
    for (const pattern of [`${TEST_REDIS_PREFIX}*:rl:*`, "*:rl:*", "rl:*", "*throttle:*"]) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

/**
 * Moves an outstanding Redis-backed link (password reset) into the past, the way waiting out its
 * lifetime would, so the "expired" screen can be tested without sleeping an hour.
 * Only keys of that one token (matched by its hash) on index 15 are touched.
 */
export async function expireLink(rawToken: string): Promise<void> {
  const hash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const redis = new Redis(redisOptions());
  try {
    if (redis.options.db !== TEST_REDIS_DB) throw new Error("Refusing to touch a Redis index other than 15");
    const keys = (await redis.keys(`*:link:*:${hash}`)).filter((key) => !key.includes("link-"));
    if (keys.length !== 1) throw new Error(`Expected exactly one link record, found ${keys.length}`);
    const record = JSON.parse((await redis.get(keys[0] as string)) ?? "{}") as { expiresAt?: number };
    record.expiresAt = Date.now() - 1000;
    await redis.set(keys[0] as string, JSON.stringify(record), "KEEPTTL");
  } finally {
    redis.disconnect();
  }
}

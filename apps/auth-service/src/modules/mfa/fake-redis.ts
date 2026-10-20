import type { RedisService } from "@/common/service/redis.service";

/** In-memory stand-in for the RedisService calls the MFA guards use (test helper). */
export function createFakeRedis(): RedisService {
  const store = new Map<string, number>();
  const key = (t: string, r: string, i: string) => `${t}:${r}:${i}`;
  const fake = {
    incr: async (t: string, r: string, i: string) => {
      const next = (store.get(key(t, r, i)) ?? 0) + 1;
      store.set(key(t, r, i), next);
      return next;
    },
    get: async (t: string, r: string, i: string) => store.get(key(t, r, i)) ?? null,
    extendTTL: async () => undefined,
  };
  return fake as unknown as RedisService;
}

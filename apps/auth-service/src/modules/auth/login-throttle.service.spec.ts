import { ConfigService } from "@nestjs/config";
import { RedisService } from "@/common/service/redis.service";
import { LoginThrottleService } from "./login-throttle.service";

const EMAIL_LIMIT = 2;
const IP_LIMIT = 3;
const WINDOW_SECONDS = 60;

function build() {
  const counts = new Map<string, number>();
  const client = {
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => 1),
    del: jest.fn(async (key: string) => {
      counts.delete(key);
      return 1;
    }),
  };
  const redis = { getClient: () => client } as unknown as RedisService;
  const values: Record<string, number | string> = {
    LOGIN_THROTTLE_EMAIL_LIMIT: EMAIL_LIMIT,
    LOGIN_THROTTLE_IP_LIMIT: IP_LIMIT,
    LOGIN_THROTTLE_WINDOW_SECONDS: WINDOW_SECONDS,
    REDIS_KEY_PREFIX: "t",
  };
  const config = {
    get: (key: string, fallback: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
  return { service: new LoginThrottleService(redis, config), client };
}

describe("LoginThrottleService", () => {
  it("allows attempts up to the email limit then blocks", async () => {
    const { service } = build();
    expect((await service.charge("t1", "a@b.com", "1.1.1.1")).blocked).toBe(false);
    expect((await service.charge("t1", "a@b.com", "1.1.1.2")).blocked).toBe(false);
    expect((await service.charge("t1", "a@b.com", "1.1.1.3")).blocked).toBe(true);
  });

  it("shares one bucket across spellings of the same email", async () => {
    const { service } = build();
    await service.charge("t1", "a@b.com", "1.1.1.1");
    await service.charge("t1", " A@B.COM", "1.1.1.2");
    expect((await service.charge("t1", "a@B.com", "1.1.1.3")).blocked).toBe(true);
  });

  it("blocks by IP across different emails", async () => {
    const { service } = build();
    await service.charge("t1", "a@b.com", "9.9.9.9");
    await service.charge("t1", "b@b.com", "9.9.9.9");
    await service.charge("t1", "c@b.com", "9.9.9.9");
    expect((await service.charge("t1", "d@b.com", "9.9.9.9")).blocked).toBe(true);
  });

  it("refund forgives the email bucket but the IP bucket keeps its count", async () => {
    const { service } = build();
    await service.charge("t1", "a@b.com", "1.1.1.1");
    await service.charge("t1", "a@b.com", "1.1.1.1");
    await service.refund("t1", "a@b.com");
    // email bucket restarted (1 <= 2); IP is at 3 <= 3
    expect((await service.charge("t1", "a@b.com", "1.1.1.1")).blocked).toBe(false);
    // IP now 4 > 3
    expect((await service.charge("t1", "a@b.com", "1.1.1.1")).blocked).toBe(true);
  });

  it("sets the expiry only on the first hit of a window", async () => {
    const { service, client } = build();
    await service.charge("t1", "a@b.com", "1.1.1.1");
    await service.charge("t1", "a@b.com", "1.1.1.1");
    expect(client.expire).toHaveBeenCalledTimes(2); // one per key (email, ip), first hit only
  });

  it("fails open when Redis is unavailable", async () => {
    const { service, client } = build();
    client.incr.mockRejectedValue(new Error("down"));
    await expect(service.charge("t1", "a@b.com", "1.1.1.1")).resolves.toEqual({ blocked: false });
  });
});

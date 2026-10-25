import { ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";

const handlers: Record<string, (arg?: unknown) => void> = {};
const redisCtor = jest.fn();
const client = {
  on: jest.fn((evt: string, cb: (arg?: unknown) => void) => {
    handlers[evt] = cb;
  }),
  quit: jest.fn().mockResolvedValue("OK"),
  set: jest.fn(),
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn(),
  expireat: jest.fn(),
  mget: jest.fn(),
};

jest.mock("ioredis", () => ({
  __esModule: true,
  default: function (opts: unknown) {
    redisCtor(opts);
    return client;
  },
}));
const logInfo = jest.fn();
const logError = jest.fn();
jest.mock("@/common/logger", () => ({
  logger: { info: (...a: unknown[]) => logInfo(...a), error: (...a: unknown[]) => logError(...a) },
}));

function config(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((k: string, d?: unknown) => (k in values ? values[k] : d)),
  } as unknown as ConfigService;
}

async function build(values: Record<string, unknown> = {}) {
  const svc = new RedisService(config(values));
  await svc.onModuleInit();
  return svc;
}

describe("RedisService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("lifecycle", () => {
    it("connects with defaults and an empty password becomes undefined", async () => {
      await build({ REDIS_PASSWORD: "" });
      expect(redisCtor).toHaveBeenCalledWith(
        expect.objectContaining({ host: "localhost", port: 6379, db: 0, password: undefined, maxRetriesPerRequest: 3 }),
      );
    });

    it("honours configured connection values", async () => {
      await build({ REDIS_HOST: "r", REDIS_PORT: 1, REDIS_PASSWORD: "pw", REDIS_DB: 4 });
      expect(redisCtor).toHaveBeenCalledWith(expect.objectContaining({ host: "r", port: 1, password: "pw", db: 4 }));
    });

    it("retry strategy backs off linearly and caps at 2000ms", async () => {
      await build();
      const { retryStrategy } = redisCtor.mock.calls[0]![0] as { retryStrategy: (n: number) => number };
      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(1000)).toBe(2000);
    });

    it("logs connect and error events", async () => {
      await build();
      handlers["connect"]!();
      handlers["error"]!(new Error("x"));
      expect(logInfo).toHaveBeenCalledWith("Redis connected");
      expect(logError).toHaveBeenCalled();
    });

    it("exposes the client and quits on destroy", async () => {
      const svc = await build();
      expect(svc.getClient()).toBe(client);
      await svc.onModuleDestroy();
      expect(client.quit).toHaveBeenCalled();
    });
  });

  describe("key namespacing", () => {
    it("prefixes keys with the configured prefix and tenant", async () => {
      const svc = await build({ REDIS_KEY_PREFIX: "px" });
      await svc.set("t1", "res", "id", 1);
      expect(client.set).toHaveBeenCalledWith("px:t:t1:res:id", "1");
    });

    it("isolates two tenants for the same resource/id", async () => {
      const svc = await build();
      await svc.get("a", "r", "i");
      await svc.get("b", "r", "i");
      expect(client.get.mock.calls.map((c) => c[0])).toEqual(["sentry:t:a:r:i", "sentry:t:b:r:i"]);
    });
  });

  describe("set/get", () => {
    it("uses SETEX when ttl is given, SET otherwise (ttl 0 means no expiry)", async () => {
      const svc = await build();
      await svc.set("t", "r", "i", { a: 1 }, 60);
      expect(client.setex).toHaveBeenCalledWith("sentry:t:t:r:i", 60, '{"a":1}');
      await svc.set("t", "r", "i", "v", 0);
      expect(client.set).toHaveBeenCalledWith("sentry:t:t:r:i", '"v"');
    });

    it("parses JSON, returns null when missing", async () => {
      const svc = await build();
      client.get.mockResolvedValueOnce('{"a":1}').mockResolvedValueOnce(null);
      await expect(svc.get("t", "r", "i")).resolves.toEqual({ a: 1 });
      await expect(svc.get("t", "r", "i")).resolves.toBeNull();
    });

    it("returns the raw string when stored value is not JSON", async () => {
      const svc = await build();
      client.get.mockResolvedValue("not-json{");
      await expect(svc.get("t", "r", "i")).resolves.toBe("not-json{");
    });
  });

  describe("delete/deletePattern", () => {
    it("deletes a scoped key", async () => {
      const svc = await build();
      await svc.delete("t", "r", "i");
      expect(client.del).toHaveBeenCalledWith("sentry:t:t:r:i");
    });

    it("deletePattern is restricted to the tenant namespace and returns count", async () => {
      const svc = await build();
      client.keys.mockResolvedValue(["k1", "k2"]);
      client.del.mockResolvedValue(2);
      await expect(svc.deletePattern("t", "sess:*")).resolves.toBe(2);
      expect(client.keys).toHaveBeenCalledWith("sentry:t:t:sess:*");
      expect(client.del).toHaveBeenCalledWith("k1", "k2");
    });

    it("deletePattern returns 0 without calling DEL when nothing matches", async () => {
      const svc = await build();
      client.keys.mockResolvedValue([]);
      await expect(svc.deletePattern("t", "x*")).resolves.toBe(0);
      expect(client.del).not.toHaveBeenCalled();
    });
  });

  describe("misc ops", () => {
    it("exists only when result is exactly 1", async () => {
      const svc = await build();
      client.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      await expect(svc.exists("t", "r", "i")).resolves.toBe(true);
      await expect(svc.exists("t", "r", "i")).resolves.toBe(false);
    });

    it("ttl / expire / incr / expireat delegate with scoped keys", async () => {
      const svc = await build();
      client.ttl.mockResolvedValue(42);
      client.incr.mockResolvedValue(7);
      await expect(svc.getTTL("t", "r", "i")).resolves.toBe(42);
      await svc.extendTTL("t", "r", "i", 10);
      await expect(svc.incr("t", "r", "i")).resolves.toBe(7);
      await svc.expireAtTimestamp("t", "r", "i", 99);
      expect(client.expire).toHaveBeenCalledWith("sentry:t:t:r:i", 10);
      expect(client.expireat).toHaveBeenCalledWith("sentry:t:t:r:i", 99);
    });

    it("getDailyApiCallCounts handles empty, nulls and counts", async () => {
      const svc = await build();
      await expect(svc.getDailyApiCallCounts("t", [])).resolves.toEqual([]);
      expect(client.mget).not.toHaveBeenCalled();
      client.mget.mockResolvedValue(["5", null, "12"]);
      await expect(svc.getDailyApiCallCounts("t", ["d1", "d2", "d3"])).resolves.toEqual([5, 0, 12]);
      expect(client.mget).toHaveBeenCalledWith(
        "sentry:t:t:api_calls:d1",
        "sentry:t:t:api_calls:d2",
        "sentry:t:t:api_calls:d3",
      );
    });
  });
});

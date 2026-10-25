import * as dns from "dns/promises";
import * as crypto from "crypto";
import { ApiException } from "@/common/http";
import { WebhookService } from "./webhook.service";

jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
jest.mock("@/common/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const lookup = dns.lookup as unknown as jest.Mock;

interface Fx {
  service: WebhookService;
  endpointRepo: Record<"create" | "save" | "find" | "findOne" | "softDelete", jest.Mock>;
  deliveryRepo: Record<"create" | "save" | "find" | "findOne" | "update", jest.Mock>;
  queue: { add: jest.Mock };
}

function build(): Fx {
  const endpointRepo = {
    create: jest.fn((v: object) => ({ id: "ep-1", ...v })),
    save: jest.fn((v: object) => Promise.resolve(v)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };
  const deliveryRepo = {
    create: jest.fn((v: object) => v),
    save: jest.fn((v: object) => Promise.resolve({ id: "d-1", ...v })),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const queue = { add: jest.fn() };
  const service = new WebhookService(
    endpointRepo as never,
    deliveryRepo as never,
    queue as never,
  );
  return { service, endpointRepo, deliveryRepo, queue };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof ApiException ? e.code : "NOT_API_EXCEPTION";
  }
}

describe("WebhookService SSRF validation (create)", () => {
  let fx: Fx;
  beforeEach(() => {
    fx = build();
    lookup.mockReset();
  });

  const dto = (url: string) => ({ url, events: ["*"] }) as never;

  it.each([
    "http://127.0.0.1/hook",
    "http://127.255.255.255/",
    "https://10.0.0.5/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://017700000001/",
    "http://127.1/",
  ])("rejects private/metadata IP literal %s", async (url) => {
    expect(await codeOf(fx.service.create("t1", dto(url)))).toBe("VALIDATION_FAILED");
    expect(fx.endpointRepo.save).not.toHaveBeenCalled();
  });

  it.each(["http://[::ffff:127.0.0.1]/", "http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:7f00:1]/"])(
    "rejects bracketed IPv6 literal %s (fails closed)",
    async (url) => {
      lookup.mockRejectedValue(new Error("ENOTFOUND"));
      expect(await codeOf(fx.service.create("t1", dto(url)))).toBe("VALIDATION_FAILED");
    },
  );

  it.each(["172.15.255.255", "172.32.0.1", "11.0.0.1", "8.8.8.8", "169.253.1.1"])(
    "allows public boundary IP %s",
    async (ip) => {
      const res = await fx.service.create("t1", dto(`https://${ip}/hook`));
      expect(res.url).toBe(`https://${ip}/hook`);
    },
  );

  it.each(["ftp://example.com/x", "file:///etc/passwd", "gopher://example.com", "javascript:alert(1)"])(
    "rejects non-http scheme %s",
    async (url) => {
      expect(await codeOf(fx.service.create("t1", dto(url)))).toBe("VALIDATION_FAILED");
    },
  );

  it("rejects an unparseable URL", async () => {
    expect(await codeOf(fx.service.create("t1", dto("not a url")))).toBe("VALIDATION_FAILED");
  });

  it("rejects a hostname resolving to localhost", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect(await codeOf(fx.service.create("t1", dto("http://localhost/hook")))).toBe("VALIDATION_FAILED");
  });

  it("rejects when ANY resolved address is private (DNS multi-record)", async () => {
    lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.1.1.1", family: 4 },
    ]);
    expect(await codeOf(fx.service.create("t1", dto("https://evil.example/")))).toBe("VALIDATION_FAILED");
  });

  it("rejects hostname resolving to IPv4-mapped IPv6 private address", async () => {
    lookup.mockResolvedValue([{ address: "::ffff:192.168.0.1", family: 6 }]);
    expect(await codeOf(fx.service.create("t1", dto("https://evil.example/")))).toBe("VALIDATION_FAILED");
  });

  it.each(["::1", "fd12::1", "fc00::1", "fe80::1"])("rejects hostname resolving to IPv6 %s", async (addr) => {
    lookup.mockResolvedValue([{ address: addr, family: 6 }]);
    expect(await codeOf(fx.service.create("t1", dto("https://evil.example/")))).toBe("VALIDATION_FAILED");
  });

  it("fails closed when DNS cannot resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await codeOf(fx.service.create("t1", dto("https://nope.example/")))).toBe("VALIDATION_FAILED");
  });

  it("accepts a hostname resolving only to public addresses", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const res = await fx.service.create("t1", { url: "https://ok.example/h", events: ["a"], description: "d" } as never);
    expect(res).toMatchObject({ tenantId: "t1", active: true, description: "d", events: ["a"] });
    expect(res.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  // Extended reserved ranges
  it("rejects CGNAT 100.64.0.0/10 shared address space", async () => {
    expect(await codeOf(fx.service.create("t1", dto("http://100.64.0.1/")))).toBe("VALIDATION_FAILED");
  });

  it("rejects IPv6 link-local fe90::/10 range beyond fe80:", async () => {
    lookup.mockResolvedValue([{ address: "fe90::1", family: 6 }]);
    expect(await codeOf(fx.service.create("t1", dto("https://evil.example/")))).toBe("VALIDATION_FAILED");
  });

  it("rejects the 0.0.0.0/8 'this network' block", async () => {
    expect(await codeOf(fx.service.create("t1", dto("http://0.1.2.3/")))).toBe("VALIDATION_FAILED");
  });

  it("rejects the IPv6 unspecified address ::", async () => {
    lookup.mockResolvedValue([{ address: "::", family: 6 }]);
    expect(await codeOf(fx.service.create("t1", dto("https://evil.example/")))).toBe("VALIDATION_FAILED");
  });
});

describe("WebhookService CRUD", () => {
  let fx: Fx;
  beforeEach(() => {
    fx = build();
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("list queries only active endpoints for the tenant", async () => {
    fx.endpointRepo.find.mockResolvedValue([{ id: "a" }]);
    await expect(fx.service.list("t1")).resolves.toEqual([{ id: "a" }]);
    expect(fx.endpointRepo.find).toHaveBeenCalledWith({
      where: { tenantId: "t1", active: true },
      order: { createdAt: "DESC" },
    });
  });

  it("findOne scopes by tenant and throws RESOURCE_NOT_FOUND", async () => {
    fx.endpointRepo.findOne.mockResolvedValue(null);
    expect(await codeOf(fx.service.findOne("t1", "x"))).toBe("RESOURCE_NOT_FOUND");
    expect(fx.endpointRepo.findOne).toHaveBeenCalledWith({ where: { id: "x", tenantId: "t1" } });
  });

  it("update validates new URL and applies changes", async () => {
    fx.endpointRepo.findOne.mockResolvedValue({ id: "e", url: "https://a.example" });
    const res = await fx.service.update("t1", "e", { url: "https://b.example", description: "z" } as never);
    expect(res).toMatchObject({ url: "https://b.example", description: "z" });
  });

  it("update rejects SSRF URL before touching the DB", async () => {
    expect(await codeOf(fx.service.update("t1", "e", { url: "http://10.0.0.1" } as never))).toBe("VALIDATION_FAILED");
    expect(fx.endpointRepo.findOne).not.toHaveBeenCalled();
  });

  it("update without url skips validation and 404s when missing", async () => {
    fx.endpointRepo.findOne.mockResolvedValue(null);
    expect(await codeOf(fx.service.update("t1", "e", { active: false } as never))).toBe("RESOURCE_NOT_FOUND");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rotateSecret generates a new 64-hex secret and persists it", async () => {
    fx.endpointRepo.findOne.mockResolvedValue({ id: "e", secret: "old" });
    const { secret } = await fx.service.rotateSecret("t1", "e");
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret).not.toBe("old");
    expect(fx.endpointRepo.save).toHaveBeenCalled();
  });

  it("delete soft-deletes; 404 when missing", async () => {
    fx.endpointRepo.findOne.mockResolvedValueOnce({ id: "e" });
    await fx.service.delete("t1", "e");
    expect(fx.endpointRepo.softDelete).toHaveBeenCalledWith("e");
    fx.endpointRepo.findOne.mockResolvedValueOnce(null);
    expect(await codeOf(fx.service.delete("t1", "e"))).toBe("RESOURCE_NOT_FOUND");
  });

  it("getDeliveries checks ownership then applies limit", async () => {
    fx.endpointRepo.findOne.mockResolvedValue({ id: "e" });
    fx.deliveryRepo.find.mockResolvedValue([]);
    await fx.service.getDeliveries("t1", "e");
    expect(fx.deliveryRepo.find).toHaveBeenCalledWith({
      where: { endpointId: "e" },
      order: { createdAt: "DESC" },
      take: 50,
    });
    await fx.service.getDeliveries("t1", "e", 5);
    expect(fx.deliveryRepo.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 5 }));
  });

  it("getDeliveries refuses foreign endpoints", async () => {
    fx.endpointRepo.findOne.mockResolvedValue(null);
    expect(await codeOf(fx.service.getDeliveries("t1", "e"))).toBe("RESOURCE_NOT_FOUND");
    expect(fx.deliveryRepo.find).not.toHaveBeenCalled();
  });
});

describe("WebhookService emit / redeliver / test", () => {
  let fx: Fx;
  beforeEach(() => {
    fx = build();
  });

  it("emit enqueues only matching endpoints (wildcard + exact)", async () => {
    fx.endpointRepo.find.mockResolvedValue([
      { id: "a", events: ["*"] },
      { id: "b", events: ["user.created"] },
      { id: "c", events: ["user.deleted"] },
    ]);
    await fx.service.emit("t1", "user.created", { x: 1 });
    expect(fx.queue.add).toHaveBeenCalledTimes(2);
    expect(fx.queue.add).toHaveBeenCalledWith(
      "deliver",
      { endpointId: "a", tenantId: "t1", eventType: "user.created", payload: { x: 1 }, deliveryId: "d-1", createdAt: expect.any(String) },
      { attempts: 5, backoff: { type: "custom" }, jobId: "d-1" },
    );
    expect(fx.deliveryRepo.save).toHaveBeenCalledTimes(2);
  });

  it("emit passes the event time and delay through, one job per delivery id", async () => {
    fx.endpointRepo.find.mockResolvedValue([{ id: "a", events: ["*"] }]);
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");
    await fx.service.emit("t1", "user.login", { x: 1 }, { occurredAt, delayMs: 500 });
    expect(fx.queue.add).toHaveBeenCalledWith(
      "deliver",
      expect.objectContaining({ createdAt: "2026-01-01T00:00:00.000Z", tenantId: "t1" }),
      expect.objectContaining({ jobId: "d-1", delay: 500 }),
    );
  });

  it("emit with no endpoints does nothing", async () => {
    fx.endpointRepo.find.mockResolvedValue([]);
    await fx.service.emit("t1", "e", {});
    expect(fx.queue.add).not.toHaveBeenCalled();
  });

  it("redeliver resets delivery and re-enqueues", async () => {
    fx.endpointRepo.findOne.mockResolvedValue({ id: "e" });
    const delivery = { id: "d", eventType: "x", payload: { a: 1 }, status: "failed", attempts: 5 };
    fx.deliveryRepo.findOne.mockResolvedValue(delivery);
    await fx.service.redeliver("t1", "e", "d");
    expect(delivery).toMatchObject({ status: "pending", attempts: 0 });
    expect(fx.queue.add).toHaveBeenCalledWith("deliver", {
      endpointId: "e", tenantId: "t1", eventType: "x", payload: { a: 1 }, deliveryId: "d",
    });
  });

  it("redeliver 404s on missing delivery or endpoint", async () => {
    fx.endpointRepo.findOne.mockResolvedValue({ id: "e" });
    fx.deliveryRepo.findOne.mockResolvedValue(null);
    expect(await codeOf(fx.service.redeliver("t1", "e", "d"))).toBe("RESOURCE_NOT_FOUND");
    fx.endpointRepo.findOne.mockResolvedValue(null);
    expect(await codeOf(fx.service.redeliver("t1", "e", "d"))).toBe("RESOURCE_NOT_FOUND");
  });

  it("sendTestEvent emits test.ping with fixed timestamp", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fx.endpointRepo.findOne.mockResolvedValue({ id: "a", active: true, events: ["other"] });
    await fx.service.sendTestEvent("t1", "a");
    expect(fx.queue.add.mock.calls[0]?.[1]).toMatchObject({
      eventType: "test.ping",
      payload: { timestamp: "2026-01-01T00:00:00.000Z" },
    });
    jest.useRealTimers();
  });
});

describe("WebhookService signing and retry helpers", () => {
  const { service } = build();

  it("buildSignatureHeader matches an independent HMAC-SHA256", () => {
    const expected = crypto.createHmac("sha256", "s3cret").update('{"a":1}', "utf8").digest("hex");
    expect(service.buildSignatureHeader("s3cret", '{"a":1}')).toBe(`sha256=${expected}`);
  });

  it("signature changes with payload and secret", () => {
    const a = service.buildSignatureHeader("k", "p");
    expect(service.buildSignatureHeader("k", "p2")).not.toBe(a);
    expect(service.buildSignatureHeader("k2", "p")).not.toBe(a);
  });

  it.each([
    [0, 60_000],
    [1, 300_000],
    [4, 28_800_000],
    [5, 28_800_000],
    [99, 28_800_000],
  ])("getRetryDelay(%i) = %i ms", (attempt, ms) => {
    expect(service.getRetryDelay(attempt)).toBe(ms);
  });

  it("markDelivery forwards status and fields", async () => {
    const fx = build();
    await fx.service.markDelivery("d", "success", { durationMs: 5 });
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith("d", { status: "success", durationMs: 5 });
  });
});

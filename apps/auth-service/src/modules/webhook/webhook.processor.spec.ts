import * as dns from "dns/promises";
import * as crypto from "crypto";
import axios from "axios";
import { WebhookProcessor } from "./webhook.processor";

jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock("@/common/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const lookup = dns.lookup as unknown as jest.Mock;
const post = axios.post as unknown as jest.Mock;

interface Fx {
  processor: WebhookProcessor;
  qr: { connect: jest.Mock; query: jest.Mock; release: jest.Mock; manager: { getRepository: jest.Mock } };
  endpointRepo: { findOne: jest.Mock; update: jest.Mock; increment: jest.Mock };
  deliveryRepo: { update: jest.Mock };
}

function build(slugRows: Array<{ slug: string }> = [{ slug: "acme" }]): Fx {
  const endpointRepo = { findOne: jest.fn(), update: jest.fn(), increment: jest.fn() };
  const deliveryRepo = { update: jest.fn() };
  const qr = {
    connect: jest.fn(),
    release: jest.fn(),
    query: jest.fn((sql: string) => (sql.includes("SELECT slug") ? Promise.resolve(slugRows) : Promise.resolve([]))),
    manager: {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === "WebhookEndpoint" ? endpointRepo : deliveryRepo,
      ),
    },
  };
  const ds = { createQueryRunner: () => qr };
  return { processor: new WebhookProcessor(ds as never), qr, endpointRepo, deliveryRepo };
}

const job = (over: Record<string, unknown> = {}) =>
  ({
    data: { endpointId: "ep", tenantId: "t1", eventType: "user.created", payload: { a: 1 }, deliveryId: "d1", createdAt: "2026-01-01T00:00:00.000Z" },
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...over,
  }) as never;

const endpoint = (url: string, over: Record<string, unknown> = {}) => ({
  id: "ep",
  url,
  secret: "topsecret",
  active: true,
  ...over,
});

describe("WebhookProcessor.process", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
    lookup.mockReset();
    post.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("marks delivery failed and releases connection when tenant is unknown", async () => {
    const fx = build([]);
    await fx.processor.process(job());
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ status: "failed", attempts: 1 }),
    );
    expect(post).not.toHaveBeenCalled();
    expect(fx.qr.release).toHaveBeenCalled();
  });

  it("marks delivery failed when endpoint missing or inactive", async () => {
    const fx = build();
    fx.endpointRepo.findOne.mockResolvedValue(null);
    await fx.processor.process(job());
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://x.example", { active: false }));
    await fx.processor.process(job({ attemptsMade: 2 }));
    expect(fx.deliveryRepo.update).toHaveBeenNthCalledWith(1, "d1", expect.objectContaining({ status: "failed", attempts: 1 }));
    expect(fx.deliveryRepo.update).toHaveBeenNthCalledWith(2, "d1", expect.objectContaining({ status: "failed", attempts: 3 }));
    expect(post).not.toHaveBeenCalled();
  });

  it("sets tenant search_path using the resolved slug", async () => {
    const fx = build();
    fx.endpointRepo.findOne.mockResolvedValue(null);
    await fx.processor.process(job());
    expect(fx.qr.query).toHaveBeenCalledWith('SET search_path TO "fk_acme", public');
  });

  it("delivers with correct HMAC signature, headers, no redirects and records success", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 204, data: undefined });

    await fx.processor.process(job());

    const [url, body, cfg] = post.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(url).toBe("https://hooks.example/in");
    expect(JSON.parse(body)).toEqual({
      id: "d1",
      type: "user.created",
      createdAt: "2026-01-01T00:00:00.000Z",
      tenantId: "t1",
      data: { a: 1 },
    });
    const expectedSig = `sha256=${crypto.createHmac("sha256", "topsecret").update(body, "utf8").digest("hex")}`;
    const headers = cfg.headers as Record<string, string>;
    expect(headers["X-Sentry-Signature"]).toBe(expectedSig);
    expect(headers["X-Sentry-Event"]).toBe("user.created");
    expect(headers["X-Sentry-Delivery"]).toBe("d1");
    expect(cfg.maxRedirects).toBe(0);
    expect(cfg.timeout).toBe(30_000);
    expect((cfg.validateStatus as (s: number) => boolean)(499)).toBe(true);
    expect((cfg.validateStatus as (s: number) => boolean)(500)).toBe(false);
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ status: "success", responseStatus: 204, responseBody: "", attempts: 1 }),
    );
    expect(fx.endpointRepo.update).toHaveBeenCalledWith("ep", { failedCount: 0, lastDeliveryAt: new Date() });
  });

  it("truncates response body to 1000 chars", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 200, data: "x".repeat(5000) });
    await fx.processor.process(job());
    const arg = fx.deliveryRepo.update.mock.calls[0]?.[1] as { responseBody: string };
    expect(arg.responseBody).toHaveLength(1000);
  });

  it("pins the HTTP agents' DNS lookup to the pre-validated IP (anti DNS-rebinding)", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 200, data: "ok" });
    await fx.processor.process(job());
    const cfg = post.mock.calls[0]?.[2] as { httpsAgent: { options: { lookup: (...a: unknown[]) => void } } };
    const cb = jest.fn();
    cfg.httpsAgent.options.lookup("rebind.example", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("does not pin for public IP-literal URLs", async () => {
    const fx = build();
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://8.8.8.8/in"));
    post.mockResolvedValue({ status: 200, data: "ok" });
    await fx.processor.process(job());
    const cfg = post.mock.calls[0]?.[2] as { httpsAgent: { options: { lookup?: unknown } } };
    expect(cfg.httpsAgent.options.lookup).toBeUndefined();
  });

  it.each([
    "http://127.0.0.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/",
    "http://[::ffff:10.0.0.1]/",
    "ftp://example.com/",
  ])("blocks SSRF target %s at delivery time, never calling axios", async (url) => {
    const fx = build();
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    fx.endpointRepo.findOne.mockResolvedValue(endpoint(url));
    await expect(fx.processor.process(job())).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith("d1", expect.objectContaining({ status: "retrying" }));
    expect(fx.qr.release).toHaveBeenCalled();
  });

  it("blocks a hostname that now resolves to a private IP (DNS rebinding after creation)", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "192.168.0.10", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://was-public.example/"));
    await expect(fx.processor.process(job())).rejects.toThrow(/SSRF blocked/);
    expect(post).not.toHaveBeenCalled();
  });

  it("fails closed when DNS lookup fails", async () => {
    const fx = build();
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://nope.example/"));
    await expect(fx.processor.process(job())).rejects.toThrow(/could not be resolved/);
    expect(post).not.toHaveBeenCalled();
  });

  it("treats a 3xx redirect response as failure (redirects are not followed)", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 302, data: "" });
    await expect(fx.processor.process(job())).rejects.toThrow("HTTP 302");
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ status: "retrying", errorMessage: "HTTP 302" }),
    );
    expect(fx.endpointRepo.increment).not.toHaveBeenCalled();
  });

  it("on last attempt marks failed and increments failedCount", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 404, data: "" });
    await expect(fx.processor.process(job({ attemptsMade: 4 }))).rejects.toThrow("HTTP 404");
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ status: "failed", attempts: 5 }),
    );
    expect(fx.endpointRepo.increment).toHaveBeenCalledWith({ id: "ep" }, "failedCount", 1);
  });

  it("defaults to a single attempt when job.opts.attempts is undefined", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockResolvedValue({ status: 500, data: "" });
    await expect(fx.processor.process(job({ opts: {} }))).rejects.toThrow();
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith("d1", expect.objectContaining({ status: "failed" }));
  });

  it("stringifies non-Error rejections", async () => {
    const fx = build();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fx.endpointRepo.findOne.mockResolvedValue(endpoint("https://hooks.example/in"));
    post.mockRejectedValue("boom");
    await expect(fx.processor.process(job())).rejects.toBe("boom");
    expect(fx.deliveryRepo.update).toHaveBeenCalledWith("d1", expect.objectContaining({ errorMessage: "boom" }));
  });

  it.each(["http://100.64.0.1/", "http://0.1.2.3/", "http://198.18.0.1/", "http://224.0.0.1/", "http://255.255.255.255/"])(
    "blocks extended reserved range %s at delivery time",
    async (url) => {
      const fx = build();
      fx.endpointRepo.findOne.mockResolvedValue(endpoint(url));
      post.mockResolvedValue({ status: 200, data: "" });
      await expect(fx.processor.process(job())).rejects.toThrow(/SSRF blocked/);
      expect(post).not.toHaveBeenCalled();
    },
  );
});

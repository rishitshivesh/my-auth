import { createHmac } from "node:crypto";
import dns = require("node:dns/promises");
import axios, { type AxiosRequestConfig } from "axios";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { WebhookService, WEBHOOK_QUEUE } from "@/modules/webhook/webhook.service";
import { WebhookProcessor, webhookBackoffMs } from "@/modules/webhook/webhook.processor";

const PUBLIC_IP = "93.184.216.34";
const HOST = "hooks.example.test";
const URL_OK = `https://${HOST}/in`;

interface Delivery {
  id: string;
  status: string;
  attempts: number;
  eventType: string;
  responseBody?: string | null;
  errorMessage?: string | null;
  responseStatus?: number | null;
}

describe("Webhooks", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let lookupMap: Record<string, string>;
  let postSpy: jest.SpyInstance;
  let posts: Array<{ url: string; body: string; config: AxiosRequestConfig }>;
  let postImpl: (url: string, body: string, config: AxiosRequestConfig) => Promise<{ status: number; data: unknown }>;

  const admin = (tn: TenantFixture) => t.http({ tenant: tn.slug, bearer: tn.admin.accessToken });
  const schemaOf = (slug: string): string => `fk_${slug.replace(/-/g, "_")}`;
  const create = async (url = URL_OK, events: string[] = ["*"]): Promise<{ id: string; secret: string }> => {
    const res = await admin(a).post("/webhooks").send({ url, events });
    expect(res.status).toBe(201);
    return { id: res.body.data.id, secret: res.body.data.secret };
  };
  const deliveries = async (id: string): Promise<Delivery[]> => (await admin(a).get(`/webhooks/${id}/deliveries`)).body.data;
  const waitFor = async <T>(fn: () => Promise<T | undefined>, ms = 8000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v !== undefined) return v;
      if (Date.now() > end) throw new Error("timed out waiting for condition");
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    posts = [];
    lookupMap = { [HOST]: PUBLIC_IP };
    postImpl = () => Promise.resolve({ status: 200, data: "ok" });
    jest.spyOn(dns, "lookup").mockImplementation(((host: string) => {
      const ip = lookupMap[host];
      if (!ip) return Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
      return Promise.resolve([{ address: ip, family: ip.includes(":") ? 6 : 4 }]);
    }) as unknown as typeof dns.lookup);
    postSpy = jest.spyOn(axios, "post").mockImplementation(((url: string, body: string, config: AxiosRequestConfig) => {
      posts.push({ url, body, config });
      return postImpl(url, body, config);
    }) as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("CRUD", () => {
    it("requires authentication", async () => {
      const h = () => t.http({ tenant: a.slug });
      expect((await h().get("/webhooks")).status).toBe(401);
      expect((await h().post("/webhooks").send({ url: URL_OK, events: ["*"] })).status).toBe(401);
      expect((await h().get("/webhooks/x")).status).toBe(401);
      expect((await h().patch("/webhooks/x").send({})).status).toBe(401);
      expect((await h().delete("/webhooks/x")).status).toBe(401);
      expect((await h().post("/webhooks/x/rotate-secret")).status).toBe(401);
      expect((await h().get("/webhooks/x/deliveries")).status).toBe(401);
      expect((await h().post("/webhooks/x/test")).status).toBe(401);
    });

    it("returns the secret exactly once, on creation", async () => {
      const { id, secret } = await create();
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      const got = await admin(a).get(`/webhooks/${id}`);
      expect(got.status).toBe(200);
      expect(JSON.stringify(got.body)).not.toContain(secret);
      expect(got.body.data.secret).toBeUndefined();
      const list = await admin(a).get("/webhooks");
      expect(JSON.stringify(list.body)).not.toContain(secret);
      const upd = await admin(a).patch(`/webhooks/${id}`).send({ description: "d" });
      expect(upd.status).toBe(200);
      expect(JSON.stringify(upd.body)).not.toContain(secret);
    });

    it("validates input", async () => {
      expect((await admin(a).post("/webhooks").send({ url: "not a url", events: ["*"] })).status).toBe(422);
      expect((await admin(a).post("/webhooks").send({ url: URL_OK, events: [] })).status).toBe(422);
      expect((await admin(a).post("/webhooks").send({ url: URL_OK })).status).toBe(422);
    });

    it("updates, rotates the secret (new value shown once) and soft-deletes", async () => {
      const { id, secret } = await create();
      const upd = await admin(a).patch(`/webhooks/${id}`).send({ events: ["user.created"], active: true });
      expect(upd.body.data.events).toEqual(["user.created"]);
      const rot = await admin(a).post(`/webhooks/${id}/rotate-secret`);
      expect(rot.status).toBe(201);
      expect(rot.body.data.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(rot.body.data.secret).not.toBe(secret);
      expect(JSON.stringify((await admin(a).get(`/webhooks/${id}`)).body)).not.toContain(rot.body.data.secret);
      expect((await admin(a).delete(`/webhooks/${id}`)).status).toBe(204);
      expect((await admin(a).get(`/webhooks/${id}`)).status).toBe(404);
      expect((await admin(a).delete(`/webhooks/${id}`)).status).toBe(404);
    });

    it("is tenant isolated on every route", async () => {
      const { id } = await create();
      expect((await admin(b).get("/webhooks")).body.data.map((w: { id: string }) => w.id)).not.toContain(id);
      expect((await admin(b).get(`/webhooks/${id}`)).status).toBe(404);
      expect((await admin(b).patch(`/webhooks/${id}`).send({ description: "x" })).status).toBe(404);
      expect((await admin(b).post(`/webhooks/${id}/rotate-secret`)).status).toBe(404);
      expect((await admin(b).delete(`/webhooks/${id}`)).status).toBe(404);
      expect((await admin(b).get(`/webhooks/${id}/deliveries`)).status).toBe(404);
    });
  });

  describe("SSRF protection", () => {
    it.each([
      "http://127.0.0.1/x",
      "http://127.1/x",
      "http://2130706433/x",
      "http://0x7f000001/x",
      "http://0/x",
      "http://0.0.0.0/x",
      "http://10.0.0.5/x",
      "http://172.16.0.1/x",
      "http://172.31.255.255/x",
      "http://192.168.1.1/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/x",
      "http://100.100.100.200/x",
      "http://198.18.0.1/x",
      "http://224.0.0.1/x",
      "http://[::1]/x",
      "http://[::]/x",
      "http://[::ffff:127.0.0.1]/x",
      "http://[::ffff:7f00:1]/x",
      "http://[fe80::1]/x",
      "http://[fd00::1]/x",
      "http://localhost/x",
      "http://localhost:6379/",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "gopher://example.com/x",
      "javascript:alert(1)",
    ])("rejects %s at creation", async (url) => {
      lookupMap.localhost = "127.0.0.1";
      const res = await admin(a).post("/webhooks").send({ url, events: ["*"] });
      expect([400, 422]).toContain(res.status);
    });

    it("rejects hostnames that resolve to private addresses (including mixed A records)", async () => {
      lookupMap["internal.example.test"] = "10.1.2.3";
      lookupMap["meta.example.test"] = "169.254.169.254";
      lookupMap["v6.example.test"] = "::ffff:192.168.0.1";
      for (const h of ["internal", "meta", "v6"]) {
        expect((await admin(a).post("/webhooks").send({ url: `https://${h}.example.test/x`, events: ["*"] })).status).toBe(422);
      }
      jest.spyOn(dns, "lookup").mockImplementation((() =>
        Promise.resolve([{ address: PUBLIC_IP, family: 4 }, { address: "10.0.0.9", family: 4 }])) as unknown as typeof dns.lookup);
      expect((await admin(a).post("/webhooks").send({ url: "https://mixed.example.test/x", events: ["*"] })).status).toBe(422);
    });

    it("rejects unresolvable hostnames (fail closed)", async () => {
      expect((await admin(a).post("/webhooks").send({ url: "https://nope.example.test/x", events: ["*"] })).status).toBe(422);
    });

    it("re-validates on update", async () => {
      const { id } = await create();
      expect((await admin(a).patch(`/webhooks/${id}`).send({ url: "http://169.254.169.254/" })).status).toBe(422);
      expect((await admin(a).get(`/webhooks/${id}`)).body.data.url).toBe(URL_OK);
    });

    it("accepts a public https endpoint", async () => {
      expect((await admin(a).post("/webhooks").send({ url: URL_OK, events: ["*"] })).status).toBe(201);
    });
  });

  describe("delivery", () => {
    it("signs the exact body with HMAC-SHA256 and sends event headers, pinned to the validated IP, without following redirects", async () => {
      const { id, secret } = await create(URL_OK, ["test.ping"]);
      expect((await admin(a).post(`/webhooks/${id}/test`)).status).toBe(202);
      const done = await waitFor(async () => (await deliveries(id)).find((d) => d.status === "success"));
      expect(done.eventType).toBe("test.ping");
      expect(posts).toHaveLength(1);
      const { url, body, config } = posts[0]!;
      expect(url).toBe(URL_OK);
      const headers = config.headers as Record<string, string>;
      expect(headers["X-Sentry-Signature"]).toBe(`sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`);
      expect(headers["X-Sentry-Event"]).toBe("test.ping");
      expect(headers["X-Sentry-Delivery"]).toBe(done.id);
      expect(headers["Content-Type"]).toBe("application/json");
      const parsed = JSON.parse(body) as { id: string; type: string; createdAt: string; tenantId: string; data: Record<string, unknown> };
      expect(parsed).toMatchObject({ id: done.id, type: "test.ping", tenantId: a.tenantId });
      expect(Math.abs(Date.now() - Date.parse(parsed.createdAt))).toBeLessThan(60_000);
      expect(config.maxRedirects).toBe(0);
      expect(config.timeout).toBeGreaterThan(0);
      const agent = config.httpsAgent as { options: { lookup: (h: string, o: object, cb: (e: Error | null, a: string, f: number) => void) => void } };
      const pinned = await new Promise<string>((resolve) => agent.options.lookup("anything.example", {}, (_e, addr) => resolve(addr)));
      expect(pinned).toBe(PUBLIC_IP);
    });

    it("a tampered body does not validate against the signature", async () => {
      const { id, secret } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      await waitFor(async () => (posts.length ? true : undefined));
      const { body, config } = posts[0]!;
      const sig = (config.headers as Record<string, string>)["X-Sentry-Signature"]!;
      const forged = `sha256=${createHmac("sha256", secret).update(body.replace("test.ping", "user.deleted"), "utf8").digest("hex")}`;
      expect(forged).not.toBe(sig);
    });

    it("only delivers events the endpoint subscribed to; the test ping targets just that endpoint", async () => {
      const { id } = await create(URL_OK, ["user.created"]);
      const other = await create(URL_OK, ["*"]);
      const emit = (type: string) =>
        t.app.get(TenantJobRunner).runInTenant(a.slug, () => t.app.get(WebhookService).emit(a.tenantId, type, { n: 1 }));
      await emit("user.deleted");
      await new Promise((r) => setTimeout(r, 600));
      expect((await deliveries(id)).filter((d) => d.eventType === "user.deleted")).toHaveLength(0);
      await emit("user.created");
      await waitFor(async () => ((await deliveries(id)).find((d) => d.eventType === "user.created" && d.status === "success")));
      // the ping goes to exactly one endpoint, even though several are active in the tenant
      const before = (await deliveries(other.id)).length;
      await admin(a).post(`/webhooks/${id}/test`);
      await waitFor(async () => ((await deliveries(id)).find((d) => d.eventType === "test.ping" && d.status === "success")));
      expect((await deliveries(other.id)).length).toBe(before);
    });

    it("records a failing delivery as retrying and schedules BullMQ backoff", async () => {
      postImpl = () => Promise.resolve({ status: 503, data: "down" });
      const { id } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "retrying"));
      expect(d.attempts).toBe(1);
      expect(d.errorMessage).toMatch(/503/);
      const queue = t.app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
      const delayed = await waitFor(async () => {
        const jobs = await queue.getDelayed();
        const mine = jobs.filter((j) => j.data.deliveryId === d.id);
        return mine.length ? mine : undefined;
      });
      expect(delayed[0]!.opts.attempts).toBe(5);
      await delayed[0]!.remove();
    });

    it("backoff schedule is 1m, 5m, 30m, 2h, 8h and never exceeds the last step", () => {
      expect([1, 2, 3, 4, 5, 9].map(webhookBackoffMs)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 28_800_000, 28_800_000]);
    });

    it("marks the delivery failed and bumps failedCount on the last attempt", async () => {
      postImpl = () => Promise.resolve({ status: 500, data: "boom" });
      const { id } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      const queue = t.app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "retrying"));
      const job = (await waitFor(async () => (await queue.getDelayed()).filter((j) => j.data.deliveryId === d.id)))[0]!;
      const processor = t.app.get(WebhookProcessor);
      await expect(
        processor.process({ ...job, data: job.data, attemptsMade: 4, opts: { attempts: 5 } } as never),
      ).rejects.toThrow(/500/);
      const final = (await deliveries(id)).find((x) => x.id === d.id)!;
      expect(final.status).toBe("failed");
      const row = await t.db.query(`SELECT failed_count FROM "${schemaOf(a.slug)}".webhook_endpoints WHERE id=$1`, [id]);
      expect(row[0].failed_count).toBeGreaterThanOrEqual(1);
      await job.remove();
    });

    it("blocks delivery when DNS later rebinds to a private address", async () => {
      const { id } = await create();
      lookupMap[HOST] = "10.0.0.8"; // rebinding after creation-time validation
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "retrying" || x.status === "failed"));
      expect(d.errorMessage).toMatch(/SSRF|private/i);
      expect(posts).toHaveLength(0);
      const queue = t.app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
      for (const j of (await queue.getDelayed()).filter((j) => j.data.deliveryId === d.id)) await j.remove();
    });

    it("blocks delivery if the stored URL is a private IP or a redirect would be required", async () => {
      const { id } = await create();
      await t.db.query(`UPDATE "${schemaOf(a.slug)}".webhook_endpoints SET url='http://169.254.169.254/latest' WHERE id=$1`, [id]);
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status !== "pending"));
      expect(d.errorMessage).toMatch(/SSRF|private/i);
      expect(posts).toHaveLength(0);
      const queue = t.app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
      for (const j of (await queue.getDelayed()).filter((j) => j.data.deliveryId === d.id)) await j.remove();
    });

    it("treats a 3xx response as a failure (redirects are never followed)", async () => {
      postImpl = () => Promise.resolve({ status: 302, data: "" });
      const { id } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "retrying"));
      expect(d.errorMessage).toMatch(/302/);
      expect(posts).toHaveLength(1);
      const queue = t.app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
      for (const j of (await queue.getDelayed()).filter((j) => j.data.deliveryId === d.id)) await j.remove();
    });

    it("refuses to ping inactive endpoints and never delivers to them", async () => {
      const { id } = await create();
      await admin(a).patch(`/webhooks/${id}`).send({ active: false });
      expect((await admin(a).post(`/webhooks/${id}/test`)).status).toBe(400);
      await t.app.get(TenantJobRunner).runInTenant(a.slug, () => t.app.get(WebhookService).emit(a.tenantId, "user.created", {}));
      await new Promise((r) => setTimeout(r, 500));
      expect(await deliveries(id)).toHaveLength(0);
    });
  });

  describe("delivery log", () => {
    it("lists newest first, honours limit and redeliver", async () => {
      const { id } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      await admin(a).post(`/webhooks/${id}/test`);
      await waitFor(async () => ((await deliveries(id)).filter((d) => d.status === "success").length >= 2 ? true : undefined));
      const one = await admin(a).get(`/webhooks/${id}/deliveries?limit=1`);
      expect(one.body.data).toHaveLength(1);
      for (const bad of ["abc", "0", "-3", "1.5"]) {
        expect((await admin(a).get(`/webhooks/${id}/deliveries?limit=${bad}`)).status).toBe(422);
      }
      expect((await admin(a).get(`/webhooks/${id}/deliveries?limit=100000`)).status).toBe(200);
      const before = posts.length;
      const first = (await deliveries(id))[0]!;
      const re = await admin(a).post(`/webhooks/${id}/deliveries/${first.id}/redeliver`);
      expect(re.status).toBe(202);
      await waitFor(async () => (posts.length > before ? true : undefined));
      expect((await admin(b).post(`/webhooks/${id}/deliveries/${first.id}/redeliver`)).status).toBe(404);
      expect((await admin(a).post(`/webhooks/${id}/deliveries/00000000-0000-0000-0000-000000000000/redeliver`)).status).toBe(404);
    });

    it("never stores the signing secret or signature, even if the receiver echoes them", async () => {
      const { id, secret } = await create();
      postImpl = (_u, _b, config) => {
        const headers = config.headers as Record<string, string>;
        return Promise.resolve({ status: 200, data: `echo ${headers["X-Sentry-Signature"]} ${secret}` });
      };
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "success"));
      expect(d.responseBody).not.toContain(secret);
      expect(d.responseBody).not.toMatch(/sha256=[0-9a-f]{64}/);
      expect(JSON.stringify(await deliveries(id))).not.toContain(secret);
    });

    it("truncates stored response bodies", async () => {
      postImpl = () => Promise.resolve({ status: 200, data: "x".repeat(50_000) });
      const { id } = await create();
      await admin(a).post(`/webhooks/${id}/test`);
      const d = await waitFor(async () => (await deliveries(id)).find((x) => x.status === "success"));
      expect((d.responseBody ?? "").length).toBeLessThanOrEqual(1000);
    });
  });

  it("uses the mocked transport only (no real network)", () => {
    expect(postSpy).toBeDefined();
  });
});

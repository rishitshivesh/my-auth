import { createHmac, timingSafeEqual } from "node:crypto";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { WEBHOOK_QUEUE, type WebhookEvent } from "@/modules/webhook/webhook.service";
import { WebhookProcessor } from "@/modules/webhook/webhook.processor";
import {
  createTenant,
  createTestApp,
  loginUser,
  OTHER_STRONG_PASSWORD,
  registerAndVerifyUser,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";

interface Received {
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  body: { id: string; type: string; createdAt: string; tenantId: string; data: Record<string, unknown> };
}

/**
 * Real webhook deliveries: audit events -> DomainEvents -> WebhookService -> BullMQ -> HTTP POST to a
 * local receiver. The SSRF guard blocks loopback; the explicit test hook (NODE_ENV=test +
 * WEBHOOK_ALLOW_LOOPBACK=true) is switched on only for this spec.
 */
describe("Webhook event delivery", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let user: UserFixture;
  let server: http.Server;
  let url: string;
  const received: Received[] = [];

  const admin = (tn: TenantFixture) => t.http({ tenant: tn.slug, bearer: tn.admin.accessToken });
  const verifySignature = (r: Received, secret: string): boolean => {
    const expected = `sha256=${createHmac("sha256", secret).update(r.rawBody, "utf8").digest("hex")}`;
    const actual = String(r.headers["x-sentry-signature"] ?? "");
    return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  };
  /**
   * The webhook queue is shared with any other process using this Redis (parallel e2e runs), and a
   * foreign worker would SSRF-block our loopback receiver. If our job was stolen or is still in
   * backoff, run this tenant's pending jobs in-process, exactly as the worker would.
   */
  const pump = async (): Promise<void> => {
    const queue = t.app.get<Queue<WebhookEvent>>(getQueueToken(WEBHOOK_QUEUE));
    const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
    for (const job of jobs.filter((j) => j.data.tenantId === a.tenantId)) {
      await job.remove().catch(() => undefined);
      await t.app.get(WebhookProcessor).process(job).catch(() => undefined);
    }
  };
  const waitForEvent = async (type: string, match: (r: Received) => boolean = () => true, ms = 15_000): Promise<Received> => {
    const start = Date.now();
    for (;;) {
      const hit = received.find((r) => r.body.type === type && match(r));
      if (hit) return hit;
      if (Date.now() - start > ms) throw new Error(`timed out waiting for ${type}; got ${received.map((r) => r.body.type).join(",")}`);
      if (Date.now() - start > 2_500) await pump();
      await new Promise((r) => setTimeout(r, 150));
    }
  };

  beforeAll(async () => {
    process.env["WEBHOOK_ALLOW_LOOPBACK"] = "true";
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
      req.on("end", () => {
        received.push({ headers: req.headers, rawBody: raw, body: JSON.parse(raw) });
        res.statusCode = 200;
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    user = await registerAndVerifyUser(t, a);
  });
  afterAll(async () => {
    delete process.env["WEBHOOK_ALLOW_LOOPBACK"];
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await t.close();
  });

  let secret: string;
  let endpointId: string;

  it("creates an endpoint on loopback only while the test hook is enabled", async () => {
    const created = await admin(a).post("/webhooks").send({ url, events: ["user.login", "login.failed", "password.changed", "session.revoked"] });
    expect(created.status).toBe(201);
    secret = created.body.data.secret;
    endpointId = created.body.data.id;

    // A non-loopback private address is still refused with the hook on.
    const blocked = await admin(a).post("/webhooks").send({ url: "http://10.0.0.5/hook", events: ["*"] });
    expect(blocked.status).toBeGreaterThanOrEqual(400);

    process.env["WEBHOOK_ALLOW_LOOPBACK"] = "false";
    const off = await admin(a).post("/webhooks").send({ url, events: ["*"] });
    expect(off.status).toBeGreaterThanOrEqual(400);
    process.env["WEBHOOK_ALLOW_LOOPBACK"] = "true";
  });

  it("a second tenant subscribed to everything never receives tenant A's events", async () => {
    const other = await admin(b).post("/webhooks").send({ url, events: ["*"] });
    expect(other.status).toBe(201);
    otherSecret = other.body.data.secret;
  });
  let otherSecret: string;

  it("delivers a signed user.login envelope after a login", async () => {
    await loginUser(t, a, user.email, user.password);
    const event = await waitForEvent("user.login", (r) => r.body.data["email"] === user.email);

    expect(verifySignature(event, secret)).toBe(true);
    expect(verifySignature(event, otherSecret)).toBe(false);
    expect(Object.keys(event.body).sort()).toEqual(["createdAt", "data", "id", "tenantId", "type"]);
    expect(event.body.tenantId).toBe(a.tenantId);
    expect(Number.isNaN(Date.parse(event.body.createdAt))).toBe(false);
    expect(event.headers["x-sentry-event"]).toBe("user.login");
    expect(event.headers["x-sentry-delivery"]).toBe(event.body.id);
    // Ids and the email already on the event; no IPs, user agents or secrets.
    expect(Object.keys(event.body.data)).toEqual(
      expect.arrayContaining(["email", "outcome", "requestId", "resourceId", "resourceType", "userId"]),
    );
    expect(Object.keys(event.body.data as Record<string, unknown>).every((k) =>
      ["email", "outcome", "requestId", "resourceId", "resourceType", "userId", "metadata"].includes(k),
    )).toBe(true);
    expect(JSON.stringify(event.body)).not.toMatch(/token|secret|"ip|10\.\d+\.\d+\.\d+/i);
  });

  it("delivers login.failed and password.changed", async () => {
    await loginUser(t, a, user.email, "Wrong-Password-1!");
    const failed = await waitForEvent("login.failed");
    expect(verifySignature(failed, secret)).toBe(true);

    const session = await loginUser(t, a, user.email, user.password);
    const change = await t
      .http({ tenant: a.slug, cookies: session.cookies })
      .post("/users/me/change-password")
      .send({ currentPassword: user.password, newPassword: OTHER_STRONG_PASSWORD });
    expect(change.status).toBe(200);
    const changed = await waitForEvent("password.changed");
    expect(verifySignature(changed, secret)).toBe(true);
    expect(changed.body.tenantId).toBe(a.tenantId);
  });

  it("is idempotent: redelivery reuses the same event id, and tenant B received nothing", async () => {
    const login = received.find((r) => r.body.type === "user.login")!;
    const before = received.filter((r) => r.body.id === login.body.id).length;
    const res = await admin(a).post(`/webhooks/${endpointId}/deliveries/${login.body.id}/redeliver`);
    expect(res.status).toBeLessThan(300);
    const end = Date.now() + 10_000;
    while (received.filter((r) => r.body.id === login.body.id).length === before && Date.now() < end) {
      await pump();
      await new Promise((r) => setTimeout(r, 150));
    }
    const copies = received.filter((r) => r.body.id === login.body.id);
    expect(copies.length).toBe(before + 1);
    expect(copies[1]!.body.id).toBe(login.body.id);

    // Tenant B's endpoint (same URL) only ever gets B's own events; none happened.
    expect(received.every((r) => r.body.tenantId === a.tenantId)).toBe(true);
  });
});

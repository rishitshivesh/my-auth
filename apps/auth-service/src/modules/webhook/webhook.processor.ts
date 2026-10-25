import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import axios from "axios";
import * as dns from "dns/promises";
import type { LookupOptions, LookupAddress } from "dns";
import * as net from "net";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { WEBHOOK_QUEUE, RETRY_DELAYS, WebhookEvent, buildWebhookEnvelope } from "./webhook.service";
import { logger } from "@/common/logger";
import { tenantSchemaName } from "@/core/tenant/tenant-schema-name";
import { isPrivateIp } from "@/common/security/private-ip";
import { isBlockedWebhookAddress } from "@/common/security/webhook-loopback";

/**
 * Validates the URL against SSRF rules and returns the first validated IP so
 * the actual HTTP request can be pinned to it, closing the TOCTOU window that
 * would otherwise allow DNS rebinding between the check and the request.
 */
async function assertNotSsrf(url: string): Promise<string | null> {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported webhook scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  if (net.isIP(hostname)) {
    if (isBlockedWebhookAddress(hostname, isPrivateIp)) {
      throw new Error("Webhook URL resolves to a private/reserved IP — SSRF blocked");
    }
    return null; // already an IP literal — no rebinding risk
  }

  // Fail closed on DNS error — an unresolvable host must not be delivered to
  const addrs = await dns.lookup(hostname, { all: true }).catch(() => {
    throw new Error("Webhook hostname could not be resolved — delivery blocked");
  });
  for (const { address } of addrs) {
    if (isBlockedWebhookAddress(address, isPrivateIp)) {
      throw new Error("Webhook URL resolves to a private/reserved IP — SSRF blocked");
    }
  }

  // Return the first resolved IP so axios can be pinned to it, preventing DNS
  // rebinding between this check and the actual request (TOCTOU).
  return addrs[0]?.address ?? null;
}

/** Receivers sometimes echo request headers/bodies; never persist the signing secret or signature. */
function redactSecrets(text: string, secrets: string[]): string {
  return secrets.reduce((acc, secret) => (secret ? acc.split(secret).join("[REDACTED]") : acc), text);
}

/** Backoff for jobs queued with `backoff: { type: "custom" }`; without it BullMQ cannot reschedule retries. */
export function webhookBackoffMs(attemptsMade: number): number {
  const idx = Math.max(0, attemptsMade - 1);
  return (RETRY_DELAYS[idx] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!) * 1000;
}

@Processor(WEBHOOK_QUEUE, { settings: { backoffStrategy: webhookBackoffMs } })
export class WebhookProcessor extends WorkerHost {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<WebhookEvent>): Promise<void> {
    const { endpointId, tenantId, eventType, deliveryId } = job.data;

    // BullMQ jobs run outside TenantSchemaMiddleware/AsyncLocalStorage. We must
    // manually set the correct search_path for this connection so TypeORM reads
    // from the tenant schema rather than the default public schema.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    try {
      // Resolve tenant slug from the public schema to build the schema name.
      const rows = await qr.query(
        `SELECT slug FROM public.tenants WHERE id = $1 LIMIT 1`,
        [tenantId],
      ) as { slug: string }[];
      const slug = rows[0]?.slug;
      if (!slug) {
        await qr.manager.getRepository(WebhookDelivery).update(deliveryId, {
          status: "failed",
          errorMessage: "Tenant not found — cannot set schema context",
          attempts: job.attemptsMade + 1,
        });
        return;
      }

      await qr.query(`SET search_path TO "${tenantSchemaName(slug)}", public`);

      const endpointRepo = qr.manager.getRepository(WebhookEndpoint);
      const deliveryRepo = qr.manager.getRepository(WebhookDelivery);

      const endpoint = await endpointRepo.findOne({ where: { id: endpointId } });
      if (!endpoint || !endpoint.active) {
        await deliveryRepo.update(deliveryId, {
          status: "failed",
          errorMessage: "Endpoint not found or inactive",
          attempts: job.attemptsMade + 1,
        });
        return;
      }

      const body = JSON.stringify(buildWebhookEnvelope(job.data));

      const signature = this.buildSignatureHeader(endpoint.secret, body);
      const start = Date.now();

      try {
        // Pin the request to the pre-validated IP to close the TOCTOU window
        // between the SSRF check (dns.lookup) and axios's own DNS resolution.
        const resolvedIp = await assertNotSsrf(endpoint.url);

        // If we resolved an IP during SSRF check, force axios to use it.
        // This prevents DNS rebinding attacks from switching the target mid-flight.
        const pinnedIp = resolvedIp;
        const lookup: http.AgentOptions["lookup"] = pinnedIp
          ? (
              _hostname: string,
              _opts: LookupOptions,
              callback: (err: NodeJS.ErrnoException | null, addr: string | LookupAddress[], family: number | undefined) => void,
            ) => callback(null, pinnedIp, net.isIP(pinnedIp) === 6 ? 6 : 4)
          : undefined;

        const httpAgent = new http.Agent({ lookup });
        const httpsAgent = new https.Agent({ lookup });

        const response = await axios.post(endpoint.url, body, {
          headers: {
            "Content-Type": "application/json",
            "X-Sentry-Signature": signature,
            "X-Sentry-Event": eventType,
            "X-Sentry-Delivery": deliveryId,
            "User-Agent": "Scrolloop-Sentry-Webhooks/1.0",
          },
          timeout: 30_000,
          // Redirects could bypass SSRF checks by pointing to internal hosts
          maxRedirects: 0,
          validateStatus: (s) => s < 500,
          httpAgent,
          httpsAgent,
        });

        const durationMs = Date.now() - start;

        if (response.status >= 200 && response.status < 300) {
          await deliveryRepo.update(deliveryId, {
            status: "success",
            responseStatus: response.status,
            responseBody: redactSecrets(String(response.data ?? ""), [endpoint.secret, signature]).slice(0, 1000),
            durationMs,
            attempts: job.attemptsMade + 1,
          });
          await endpointRepo.update(endpointId, {
            failedCount: 0,
            lastDeliveryAt: new Date(),
          });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

        await deliveryRepo.update(deliveryId, {
          status: isLastAttempt ? "failed" : "retrying",
          errorMessage,
          durationMs,
          attempts: job.attemptsMade + 1,
        });

        if (isLastAttempt) {
          await endpointRepo.increment({ id: endpointId }, "failedCount", 1);
        }

        logger.warn({ deliveryId, endpointId, attempt: job.attemptsMade + 1, error: errorMessage }, "Webhook delivery failed");
        throw err;
      }
    } finally {
      await qr.release();
    }
  }

  private buildSignatureHeader(secret: string, payload: string): string {
    const sig = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return `sha256=${sig}`;
  }
}

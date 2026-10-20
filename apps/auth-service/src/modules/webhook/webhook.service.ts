import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import * as dns from "dns/promises";
import * as net from "net";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhook.dto";
import { logger } from "@/common/logger";

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

// Strip IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 → 192.168.1.1) before range check
// to prevent bypasses via IPv4-mapped notation
function normalizeIp(address: string): string {
  const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return v4mapped?.[1] ?? address;
}

function isPrivateIp(address: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(normalizeIp(address)));
}

function urlError(message: string): ApiException {
  return new ApiException("VALIDATION_FAILED", {
    errors: [{ field: "url", message }],
  });
}

async function validateWebhookUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw urlError("Invalid webhook URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw urlError("Webhook URL must use http or https");
  }

  const hostname = parsed.hostname;
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw urlError("Webhook URL must not point to a private or reserved IP address");
    }
    return;
  }

  // Do NOT swallow DNS errors — an unresolvable hostname should be rejected,
  // not silently accepted (which would be a fail-open SSRF bypass)
  const addrs = await dns.lookup(hostname, { all: true }).catch(() => {
    throw urlError("Webhook URL hostname could not be resolved");
  });
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw urlError("Webhook URL resolves to a private or reserved IP address");
    }
  }
}

export const WEBHOOK_QUEUE = "webhook-delivery";

export interface WebhookEvent {
  endpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  deliveryId: string;
}

// Retry schedule in seconds: 60s, 5min, 30min, 2h, 8h
const RETRY_DELAYS = [60, 300, 1800, 7200, 28800];

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(WebhookEndpoint)
    private endpointRepo: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue(WEBHOOK_QUEUE)
    private queue: Queue<WebhookEvent>,
  ) {}

  async create(tenantId: string, dto: CreateWebhookDto): Promise<WebhookEndpoint> {
    await validateWebhookUrl(dto.url);
    const secret = crypto.randomBytes(32).toString("hex");
    const endpoint = this.endpointRepo.create({
      tenantId,
      url: dto.url,
      secret,
      events: dto.events,
      description: dto.description,
      active: true,
    });
    return this.endpointRepo.save(endpoint);
  }

  async list(tenantId: string): Promise<WebhookEndpoint[]> {
    return this.endpointRepo.find({
      where: { tenantId, active: true },
      order: { createdAt: "DESC" },
    });
  }

  async findOne(tenantId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.endpointRepo.findOne({ where: { id, tenantId } });
    if (!endpoint) throw new ApiException("RESOURCE_NOT_FOUND", { detail: "Webhook endpoint not found" });
    return endpoint;
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookDto): Promise<WebhookEndpoint> {
    if (dto.url) await validateWebhookUrl(dto.url);
    const endpoint = await this.findOne(tenantId, id);
    Object.assign(endpoint, dto);
    return this.endpointRepo.save(endpoint);
  }

  async rotateSecret(tenantId: string, id: string): Promise<{ secret: string }> {
    const endpoint = await this.findOne(tenantId, id);
    endpoint.secret = crypto.randomBytes(32).toString("hex");
    await this.endpointRepo.save(endpoint);
    return { secret: endpoint.secret };
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const endpoint = await this.findOne(tenantId, id);
    await this.endpointRepo.softDelete(endpoint.id);
  }

  async getDeliveries(tenantId: string, endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
    await this.findOne(tenantId, endpointId);
    return this.deliveryRepo.find({
      where: { endpointId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  async emit(tenantId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: { tenantId, active: true },
    });

    const matchingEndpoints = endpoints.filter(
      (ep) => ep.events.includes("*") || ep.events.includes(eventType),
    );

    for (const endpoint of matchingEndpoints) {
      const delivery = this.deliveryRepo.create({
        endpointId: endpoint.id,
        eventType,
        payload,
        status: "pending",
        attempts: 0,
      });
      const saved = await this.deliveryRepo.save(delivery);

      await this.queue.add(
        "deliver",
        {
          endpointId: endpoint.id,
          tenantId,
          eventType,
          payload,
          deliveryId: saved.id,
        },
        { attempts: RETRY_DELAYS.length, backoff: { type: "custom" } },
      );
    }
  }

  async redeliver(tenantId: string, endpointId: string, deliveryId: string): Promise<void> {
    const endpoint = await this.findOne(tenantId, endpointId);
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId, endpointId },
    });
    if (!delivery) throw new ApiException("RESOURCE_NOT_FOUND", { detail: "Delivery not found" });

    delivery.status = "pending";
    delivery.attempts = 0;
    await this.deliveryRepo.save(delivery);

    await this.queue.add("deliver", {
      endpointId: endpoint.id,
      tenantId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      deliveryId: delivery.id,
    });
  }

  async sendTestEvent(tenantId: string, endpointId: string): Promise<void> {
    await this.emit(tenantId, "test.ping", {
      message: "This is a test delivery from Scrolloop Sentry",
      timestamp: new Date().toISOString(),
    });
  }

  buildSignatureHeader(secret: string, payload: string): string {
    const sig = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");
    return `sha256=${sig}`;
  }

  getRetryDelay(attempt: number): number {
    return (RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!) * 1000;
  }

  async markDelivery(
    deliveryId: string,
    status: "success" | "failed" | "retrying",
    fields: {
      errorMessage?: string;
      durationMs?: number;
      attempts?: number;
      responseStatus?: number;
      responseBody?: string;
    },
  ): Promise<void> {
    await this.deliveryRepo.update(deliveryId, { status, ...fields });
  }
}

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
import { isPrivateIp } from "@/common/security/private-ip";
import { isBlockedWebhookAddress } from "@/common/security/webhook-loopback";

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
    if (isBlockedWebhookAddress(hostname, isPrivateIp)) {
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
    if (isBlockedWebhookAddress(address, isPrivateIp)) {
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
  /** When the underlying event happened (ISO 8601); defaults to enqueue time. */
  createdAt?: string;
}

/**
 * Stable body POSTed to subscribers. `id` is the delivery id: identical across
 * retries and manual redeliveries, so receivers can dedupe on it.
 */
export interface WebhookEnvelope {
  id: string;
  type: string;
  createdAt: string;
  tenantId: string;
  data: Record<string, unknown>;
}

export function buildWebhookEnvelope(event: WebhookEvent): WebhookEnvelope {
  return {
    id: event.deliveryId,
    type: event.eventType,
    createdAt: event.createdAt ?? new Date().toISOString(),
    tenantId: event.tenantId,
    data: event.payload,
  };
}

/** Lets the originating request finish committing before subscribers hear about it. */
export const EVENT_DISPATCH_DELAY_MS = 500;

export interface EmitOptions {
  /** Event time; defaults to now. */
  occurredAt?: Date;
  /** BullMQ delay before the first delivery attempt. */
  delayMs?: number;
}

// Retry schedule in seconds: 60s, 5min, 30min, 2h, 8h
export const RETRY_DELAYS = [60, 300, 1800, 7200, 28800];

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

  async emit(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
    options: EmitOptions = {},
  ): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: { tenantId, active: true },
    });

    const matchingEndpoints = endpoints.filter(
      (ep) => ep.events.includes("*") || ep.events.includes(eventType),
    );

    for (const endpoint of matchingEndpoints) {
      await this.enqueueDelivery(tenantId, endpoint, eventType, payload, options);
    }
  }

  private async enqueueDelivery(
    tenantId: string,
    endpoint: WebhookEndpoint,
    eventType: string,
    payload: Record<string, unknown>,
    options: EmitOptions = {},
  ): Promise<void> {
    const createdAt = (options.occurredAt ?? new Date()).toISOString();
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
        createdAt,
      },
      {
        attempts: RETRY_DELAYS.length,
        backoff: { type: "custom" },
        // One job per delivery: a duplicate enqueue of the same delivery is a no-op.
        jobId: saved.id,
        ...(options.delayMs ? { delay: options.delayMs } : {}),
      },
    );
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
      createdAt: delivery.createdAt?.toISOString(),
    });
  }

  /** Sends a ping to this endpoint only (regardless of its event subscriptions). */
  async sendTestEvent(tenantId: string, endpointId: string): Promise<void> {
    const endpoint = await this.findOne(tenantId, endpointId);
    if (!endpoint.active) {
      throw new ApiException("BAD_REQUEST", { detail: "Webhook endpoint is inactive" });
    }
    await this.enqueueDelivery(tenantId, endpoint, "test.ping", {
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

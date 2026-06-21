import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhook.dto";
import { logger } from "@/common/logger";

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
    if (!endpoint) throw new NotFoundException("Webhook endpoint not found");
    return endpoint;
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookDto): Promise<WebhookEndpoint> {
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
    if (!delivery) throw new NotFoundException("Delivery not found");

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

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import axios from "axios";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { WEBHOOK_QUEUE, WebhookEvent, WebhookService } from "./webhook.service";
import { logger } from "@/common/logger";

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(
    @InjectRepository(WebhookEndpoint)
    private endpointRepo: Repository<WebhookEndpoint>,
    private webhookService: WebhookService,
  ) {
    super();
  }

  async process(job: Job<WebhookEvent>): Promise<void> {
    const { endpointId, eventType, payload, deliveryId } = job.data;

    const endpoint = await this.endpointRepo.findOne({ where: { id: endpointId } });
    if (!endpoint || !endpoint.active) {
      await this.webhookService.markDelivery(deliveryId, "failed", {
        errorMessage: "Endpoint not found or inactive",
      });
      return;
    }

    const body = JSON.stringify({
      id: deliveryId,
      type: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    const signature = this.webhookService.buildSignatureHeader(endpoint.secret, body);
    const start = Date.now();

    try {
      const response = await axios.post(endpoint.url, body, {
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Signature": signature,
          "X-Sentry-Event": eventType,
          "X-Sentry-Delivery": deliveryId,
          "User-Agent": "Scrolloop-Sentry-Webhooks/1.0",
        },
        timeout: 30_000,
        validateStatus: (s) => s < 500,
      });

      const durationMs = Date.now() - start;

      if (response.status >= 200 && response.status < 300) {
        await this.webhookService.markDelivery(deliveryId, "success", {
          responseStatus: response.status,
          responseBody: String(response.data ?? "").slice(0, 1000),
          durationMs,
          attempts: job.attemptsMade + 1,
        });
        await this.endpointRepo.update(endpointId, {
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

      await this.webhookService.markDelivery(
        deliveryId,
        isLastAttempt ? "failed" : "retrying",
        { errorMessage, durationMs, attempts: job.attemptsMade + 1 },
      );

      if (isLastAttempt) {
        await this.endpointRepo.increment({ id: endpointId }, "failedCount", 1);
      }

      logger.warn({ deliveryId, endpointId, attempt: job.attemptsMade + 1, error: errorMessage }, "Webhook delivery failed");
      throw err;
    }
  }
}

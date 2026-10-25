import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { WebhookService, WEBHOOK_QUEUE } from "./webhook.service";
import { WebhookController } from "./webhook.controller";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookEventDispatcher } from "./webhook-event.dispatcher";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    // WebhookService uses these repositories for request-scoped operations
    TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    GuardsModule,
  ],
  controllers: [WebhookController],
  // WebhookProcessor uses DataSource directly (globally provided by TypeOrmModule.forRoot)
  // to set the correct tenant search_path for BullMQ jobs, which run outside
  // the TenantSchemaMiddleware/AsyncLocalStorage request context.
  providers: [WebhookService, WebhookProcessor, WebhookEventDispatcher],
  exports: [WebhookService],
})
export class WebhookModule {}

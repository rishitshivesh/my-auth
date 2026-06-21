import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { WebhookEndpoint, WebhookDelivery } from "@repo/database";
import { WebhookService, WEBHOOK_QUEUE } from "./webhook.service";
import { WebhookController } from "./webhook.controller";
import { WebhookProcessor } from "./webhook.processor";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    GuardsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}

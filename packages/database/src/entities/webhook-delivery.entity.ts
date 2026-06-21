import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type WebhookDeliveryStatus = "pending" | "success" | "failed" | "retrying";

@Entity("webhook_deliveries")
@Index(["endpointId"])
@Index(["status"])
export class WebhookDelivery extends BaseEntity {
  @Column({ type: "uuid", name: "endpoint_id" })
  endpointId!: string;

  @Column({ type: "varchar", length: 128, name: "event_type" })
  eventType!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: WebhookDeliveryStatus;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "timestamp with time zone", name: "next_retry_at", nullable: true })
  nextRetryAt?: Date;

  @Column({ type: "int", name: "response_status", nullable: true })
  responseStatus?: number;

  @Column({ type: "text", name: "response_body", nullable: true })
  responseBody?: string;

  @Column({ type: "text", name: "error_message", nullable: true })
  errorMessage?: string;

  @Column({ type: "int", name: "duration_ms", nullable: true })
  durationMs?: number;
}

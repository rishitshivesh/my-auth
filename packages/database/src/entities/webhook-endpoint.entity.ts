import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("webhook_endpoints")
@Index(["tenantId"])
export class WebhookEndpoint extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @Column({ type: "varchar", length: 512 })
  url!: string;

  @Column({ type: "varchar", length: 128 })
  secret!: string;

  @Column({ type: "jsonb", default: [] })
  events!: string[];

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "int", name: "failed_count", default: 0 })
  failedCount!: number;

  @Column({ type: "timestamp with time zone", name: "last_delivery_at", nullable: true })
  lastDeliveryAt?: Date;

  @Column({ type: "varchar", length: 255, nullable: true })
  description?: string;
}

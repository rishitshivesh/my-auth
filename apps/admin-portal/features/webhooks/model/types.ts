/** Response shapes of apps/auth-service/src/modules/webhook. */

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failedCount: number;
  lastDeliveryAt?: string | null;
  description?: string | null;
  createdAt?: string;
  /** Present only on the create response; never listed afterwards. */
  secret?: string;
}

export interface CreateWebhookBody {
  url: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookBody {
  active?: boolean;
  url?: string;
  events?: string[];
  description?: string;
}

export interface RotatedWebhookSecret {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

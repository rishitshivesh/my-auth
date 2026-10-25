import { isHttpUrl } from "@/features/applications/model/uri";
import type { CreateWebhookBody, WebhookDelivery, WebhookEndpoint } from "./types";

export const WEBHOOK_EVENTS = [
  "user.created", "user.updated", "user.deleted", "session.created", "session.revoked",
  "mfa.enrolled", "mfa.disabled", "oauth.token.issued", "*",
] as const;
export type WebhookEventId = (typeof WEBHOOK_EVENTS)[number];

export const ALL_EVENTS = "*";
export const DELIVERY_LIMIT = 50;

export interface WebhookDraft {
  url: string;
  description: string;
  events: readonly string[];
}

export const EMPTY_WEBHOOK_DRAFT: WebhookDraft = { url: "", description: "", events: [] };

export type WebhookError = "url" | "events";

/** Picking the wildcard replaces specific events; picking a specific one drops the wildcard. */
export function toggleEvent(events: readonly string[], event: string): string[] {
  if (events.includes(event)) return events.filter((e) => e !== event);
  if (event === ALL_EVENTS) return [ALL_EVENTS];
  return [...events.filter((e) => e !== ALL_EVENTS), event];
}

export function validateWebhookDraft(draft: WebhookDraft): WebhookError[] {
  const errors: WebhookError[] = [];
  if (!isHttpUrl(draft.url.trim())) errors.push("url");
  if (draft.events.length === 0) errors.push("events");
  return errors;
}

export function toWebhookBody(draft: WebhookDraft): CreateWebhookBody {
  const description = draft.description.trim();
  return { url: draft.url.trim(), events: [...draft.events], ...(description ? { description } : {}) };
}

export interface WebhookRow extends WebhookEndpoint {
  /** Row label for accessible action menus. */
  name: string;
}

export function toRows(endpoints: readonly WebhookEndpoint[]): WebhookRow[] {
  return endpoints.map((e) => ({ ...e, name: e.url }));
}

export function filterWebhooks(rows: readonly WebhookRow[], search: string): WebhookRow[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((r) => r.url.toLowerCase().includes(needle) || (r.description ?? "").toLowerCase().includes(needle));
}

export type DeliveryKind = "success" | "failed" | "pending" | "retrying";

export function deliveryKind(status: string): DeliveryKind {
  if (status === "success" || status === "failed" || status === "retrying") return status;
  return "pending";
}

/** Only settled deliveries can be replayed; a pending one is already queued. */
export function canRedeliver(status: string): boolean {
  const kind = deliveryKind(status);
  return kind === "success" || kind === "failed";
}

/** First line of the diagnostics: the server error, else the HTTP status, else nothing. */
export function deliveryOutcome(d: Pick<WebhookDelivery, "responseStatus" | "errorMessage">): { status?: number; error?: string } {
  return {
    ...(d.responseStatus ? { status: d.responseStatus } : {}),
    ...(d.errorMessage ? { error: d.errorMessage } : {}),
  };
}

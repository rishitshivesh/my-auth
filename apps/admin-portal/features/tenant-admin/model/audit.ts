export type AuditSeverity = "info" | "medium" | "warning" | "high" | "critical";

export interface AuditEvent {
  id: string;
  eventType: string;
  severity: AuditSeverity | string;
  actorEmail?: string | null;
  userId?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: "success" | "failure" | null;
  requestId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
  total: number;
}

/** Filters the backend `AuditFiltersDto` supports. Dates are `YYYY-MM-DD` from date inputs. */
export interface AuditFilters {
  eventType: string;
  userId: string;
  requestId: string;
  startDate: string;
  endDate: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = { eventType: "", userId: "", requestId: "", startDate: "", endDate: "" };

export const AUDIT_PAGE_LIMIT = 50;
export const REQUEST_ID_MAX_LENGTH = 64;
const REDACTED = "[redacted]";
const SECRET_KEY = /(secret|token|password|passwd|authorization|cookie|apikey|api_key|otp|code|credential|private)/i;

export type AuditFilterError = "range" | "requestIdTooLong";
export type AuditFilterErrors = Partial<Record<keyof AuditFilters, AuditFilterError>>;

export function hasActiveFilters(filters: AuditFilters): boolean {
  return Object.values(filters).some((value) => value.trim() !== "");
}

export function validateAuditFilters(filters: AuditFilters): AuditFilterErrors {
  const errors: AuditFilterErrors = {};
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) errors.endDate = "range";
  if (filters.requestId.length > REQUEST_ID_MAX_LENGTH) errors.requestId = "requestIdTooLong";
  return errors;
}

/** Query string for GET /audit and /audit/export; empty values are omitted. */
export function auditQuery(filters: AuditFilters, options: { cursor?: string; limit?: number } = {}): string {
  const params = new URLSearchParams();
  const text = { eventType: filters.eventType, userId: filters.userId, requestId: filters.requestId };
  for (const [key, value] of Object.entries(text)) {
    if (value.trim()) params.set(key, value.trim());
  }
  if (filters.startDate) params.set("startDate", `${filters.startDate}T00:00:00.000Z`);
  if (filters.endDate) params.set("endDate", `${filters.endDate}T23:59:59.999Z`);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  return params.toString();
}

export interface MetadataEntry {
  key: string;
  value: string;
}

/** Defence in depth: the server strips secrets, the UI never renders secret-looking keys either. */
export function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): MetadataEntry[] {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: SECRET_KEY.test(key) ? REDACTED : typeof value === "string" ? value : JSON.stringify(value),
  }));
}

export function exportFilename(slug: string, now: Date): string {
  return `audit-${slug}-${now.toISOString().slice(0, 10)}.csv`;
}

export function mergePages(pages: readonly AuditPage[]): AuditEvent[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((event) => !seen.has(event.id) && seen.add(event.id));
}

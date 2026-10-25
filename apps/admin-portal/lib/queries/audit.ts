import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { downloadTextFile } from "@/lib/download";
import { ActivityEvent } from "@/lib/types";
import { apiUrl } from "./shared";

// ── Server-side Audit Log ─────────────────────────────────────

export interface AuditLogFilters {
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

function buildAuditQs(filters: AuditLogFilters & { cursor?: string }): string {
  const qs = new URLSearchParams();
  if (filters.eventType) qs.set("eventType", filters.eventType);
  if (filters.startDate) qs.set("startDate", filters.startDate);
  if (filters.endDate) qs.set("endDate", filters.endDate);
  qs.set("limit", String(filters.limit ?? 50));
  if (filters.cursor) qs.set("cursor", filters.cursor);
  return qs.toString();
}

export function useAuditLogsFiltered(filters: AuditLogFilters & { cursor?: string }) {
  return useQuery<{ items: ActivityEvent[]; nextCursor: string | null; total: number }>({
    queryKey: ["audit", "filtered", filters],
    queryFn: withErrorHandler<[], { items: ActivityEvent[]; nextCursor: string | null; total: number }>(
      async () => authClient.request({
        url: apiUrl(`/audit?${buildAuditQs(filters)}`),
        method: "GET",
      })
    ),
  });
}

const fetchAuditPage = withErrorHandler<
  [AuditLogFilters & { cursor?: string }],
  { items: ActivityEvent[]; nextCursor: string | null; total: number }
>(
  async (f) =>
    authClient.request({
      url: apiUrl(`/audit?${buildAuditQs(f)}`),
      method: "GET",
    }),
);

export function useAuditLogsInfinite(filters: AuditLogFilters) {
  return useInfiniteQuery<
    { items: ActivityEvent[]; nextCursor: string | null; total: number },
    Error,
    { pages: Array<{ items: ActivityEvent[]; nextCursor: string | null; total: number }> },
    string[],
    string | undefined
  >({
    queryKey: ["audit", "infinite", filters.eventType ?? "", filters.startDate ?? "", filters.endDate ?? ""],
    queryFn: ({ pageParam }) => fetchAuditPage({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined,
  });
}

export function useExportAuditCsv(tenantSlug?: string) {
  return useMutation<void, Error, AuditLogFilters>({
    mutationFn: async (filters) => {
      const qs = buildAuditQs(filters);
      // Routed through the SDK so the tenant header, cookie credentials and
      // silent refresh behave like every other call (ADR-0003). The tenant
      // slug override keeps local dev working where the subdomain is absent.
      const csv = await withErrorHandler<[], string>(async () =>
        authClient.request({
          url: apiUrl(`/audit/export?${qs}`),
          method: "GET",
          headers: tenantSlug ? { "X-Tenant-Slug": tenantSlug } : undefined,
        }),
      )();
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadTextFile(csv, `audit-${tenantSlug ?? "export"}-${dateStr}.csv`, "text/csv");
    },
  });
}

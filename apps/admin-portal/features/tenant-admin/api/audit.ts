"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/constants/query-keys";
import { downloadTextFile } from "@/lib/download";
import { apiRequest } from "@/lib/api-request";
import { useQueryScope } from "@/lib/query-scope";
import { AUDIT_PAGE_LIMIT, auditQuery, exportFilename, type AuditFilters, type AuditPage } from "../model/audit";

export function useAuditEvents(slug: string, filters: AuditFilters) {
  const scope = useQueryScope(slug);
  return useInfiniteQuery({
    queryKey: queryKeys(scope).audit.list({ ...filters }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest<AuditPage>("GET", `/audit?${auditQuery(filters, { cursor: pageParam, limit: AUDIT_PAGE_LIMIT })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** CSV export of the filtered events; the server caps the row count. */
export function useExportAudit(slug: string) {
  return useMutation({
    mutationFn: async (filters: AuditFilters) => {
      const csv = await apiRequest<string>("GET", `/audit/export?${auditQuery(filters)}`);
      downloadTextFile(csv, exportFilename(slug, new Date()), "text/csv");
    },
  });
}

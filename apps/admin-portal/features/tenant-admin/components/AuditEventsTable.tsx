"use client";

import { ResourceTable, SentryButton, type ResourceStatus } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatTimestamp } from "@/lib/format";
import type { AuditEvent } from "../model/audit";

export interface AuditEventsTableProps {
  events: AuditEvent[];
  total: number;
  status: ResourceStatus;
  isFiltered: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onSelect: (event: AuditEvent) => void;
}

export function AuditEventsTable({
  events, total, status, isFiltered, hasMore, isLoadingMore, onLoadMore, onRetry, onClearFilters, onSelect,
}: AuditEventsTableProps) {
  const { t } = useCopy();
  const retry = { label: t("tenantAdmin.common.retry"), onClick: onRetry };
  return (
    <div className="space-y-4">
      <ResourceTable
        columns={[
          { header: t("tenantAdmin.audit.columns.event"), accessorKey: (e: AuditEvent) => <span className="font-mono text-xs">{e.eventType}</span> },
          { header: t("tenantAdmin.audit.columns.actor"), accessorKey: (e: AuditEvent) => e.actorEmail ?? t("tenantAdmin.audit.unknownActor") },
          { header: t("tenantAdmin.audit.columns.resource"), accessorKey: (e: AuditEvent) => e.resourceType ?? t("tenantAdmin.audit.noResource") },
          { header: t("tenantAdmin.audit.columns.outcome"), accessorKey: (e: AuditEvent) => (e.outcome ? t(`tenantAdmin.audit.outcome.${e.outcome}`) : "") },
          { header: t("tenantAdmin.audit.columns.severity"), accessorKey: "severity" },
          { header: t("tenantAdmin.audit.columns.time"), accessorKey: (e: AuditEvent) => formatTimestamp(e.createdAt) },
        ]}
        rows={events}
        status={status}
        isFiltered={isFiltered}
        rowActions={(event) => [{ id: "details", label: t("tenantAdmin.audit.viewDetails", { event: event.eventType }), onSelect: () => onSelect(event) }]}
        labels={{
          searchLabel: "",
          searchPlaceholder: "",
          previous: "",
          next: "",
          pageStatus: "",
          rowActions: (event) => t("common.actions.rowActions", { name: event.eventType }),
          loading: { title: t("tenantAdmin.common.loading") },
          empty: { title: t("tenantAdmin.audit.emptyTitle"), description: t("tenantAdmin.audit.emptyBody") },
          filteredEmpty: { title: t("tenantAdmin.audit.filteredTitle"), description: t("tenantAdmin.audit.filteredBody"), clear: { label: t("tenantAdmin.audit.filters.clear"), onClick: onClearFilters } },
          error: { title: t("tenantAdmin.common.errorTitle"), description: t("tenantAdmin.common.errorBody"), retry },
          denied: { title: t("tenantAdmin.common.deniedTitle"), description: t("tenantAdmin.common.deniedBody") },
          unavailable: { title: t("tenantAdmin.common.unavailableTitle"), description: t("tenantAdmin.common.unavailableBody"), retry },
        }}
      />
      {status === "ready" && events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="font-body text-sm text-muted-foreground">
            {t("tenantAdmin.audit.count", { shown: events.length, total })}
          </p>
          {hasMore && (
            <SentryButton variant="outline" isLoading={isLoadingMore} onClick={onLoadMore}>
              {t("tenantAdmin.audit.loadMore")}
            </SentryButton>
          )}
        </div>
      )}
    </div>
  );
}

import { ResourceTable, StatusBadge, type ResourceColumn, type ResourceStatus, type RowAction } from "@repo/ui";
import { tableLabels } from "@/features/applications/components/table-labels";
import { formatDate } from "@/features/applications/model/format";
import { useCopy } from "@/i18n";
import { ALL_EVENTS, type WebhookRow } from "../model/webhooks";

export interface WebhooksTableProps {
  rows: readonly WebhookRow[];
  status: ResourceStatus;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onAdd?: () => void;
  actions?: (row: WebhookRow) => readonly RowAction[];
}

export function WebhooksTable({ rows, status, search, onSearchChange, onRetry, onAdd, actions }: WebhooksTableProps) {
  const { t } = useCopy();
  const c = "tenantIntegrations.webhooks.columns" as const;
  const columns: ResourceColumn<WebhookRow>[] = [
    {
      header: t(`${c}.url`),
      accessorKey: (row) => (
        <span className="flex flex-col gap-0.5">
          <code className="break-all font-mono text-xs text-foreground">{row.url}</code>
          {row.description && <span className="text-xs text-muted-foreground">{row.description}</span>}
        </span>
      ),
    },
    {
      header: t(`${c}.events`),
      accessorKey: (row) =>
        row.events.includes(ALL_EVENTS)
          ? t("tenantIntegrations.webhooks.allEvents")
          : t("tenantIntegrations.webhooks.eventCount", { count: row.events.length }),
    },
    {
      header: t(`${c}.status`),
      accessorKey: (row) => (
        <StatusBadge status={row.active ? "active" : "system"}>
          {t(row.active ? "tenantIntegrations.common.active" : "tenantIntegrations.common.inactive")}
        </StatusBadge>
      ),
    },
    { header: t(`${c}.lastDelivery`), accessorKey: (row) => formatDate(row.lastDeliveryAt, t("tenantIntegrations.common.never")) },
    { header: t(`${c}.failures`), accessorKey: (row) => row.failedCount },
  ];
  const labels = tableLabels({
    searchLabel: t("tenantIntegrations.webhooks.searchLabel"),
    searchPlaceholder: t("tenantIntegrations.webhooks.searchPlaceholder"),
    loading: t("tenantIntegrations.webhooks.loading"),
    emptyTitle: t("tenantIntegrations.webhooks.emptyTitle"),
    emptyDescription: t("tenantIntegrations.webhooks.emptyDescription"),
    emptyAction: onAdd ? { label: t("tenantIntegrations.webhooks.add"), onClick: onAdd } : undefined,
    filteredEmptyTitle: t("tenantIntegrations.webhooks.filteredEmptyTitle"),
    onClearSearch: () => onSearchChange(""),
    onRetry,
    rowActions: (name) => t("common.actions.rowActions", { name }),
  });
  return (
    <ResourceTable<WebhookRow>
      columns={columns}
      rows={[...rows]}
      status={status}
      labels={labels}
      searchValue={search}
      onSearchChange={onSearchChange}
      isFiltered={search.trim() !== ""}
      rowActions={actions}
    />
  );
}

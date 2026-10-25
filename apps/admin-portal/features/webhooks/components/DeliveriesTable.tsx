import { ResourceTable, StatusBadge, type ResourceColumn, type ResourceStatus, type RowAction } from "@repo/ui";
import { tableLabels } from "@/features/applications/components/table-labels";
import { formatDate } from "@/features/applications/model/format";
import { useCopy } from "@/i18n";
import type { WebhookDelivery } from "../model/types";
import { deliveryKind, deliveryOutcome, type DeliveryKind } from "../model/webhooks";

export interface DeliveriesTableProps {
  rows: readonly (WebhookDelivery & { name: string })[];
  status: ResourceStatus;
  onRetry: () => void;
  actions?: (row: WebhookDelivery) => readonly RowAction[];
}

const BADGE: Record<DeliveryKind, "active" | "suspended" | "pending"> = {
  success: "active", failed: "suspended", pending: "pending", retrying: "pending",
};

export function DeliveriesTable({ rows, status, onRetry, actions }: DeliveriesTableProps) {
  const { t, tk } = useCopy();
  const c = "tenantIntegrations.webhooks.diagnostics.columns" as const;
  const d = "tenantIntegrations.webhooks.diagnostics" as const;
  const columns: ResourceColumn<WebhookDelivery & { name: string }>[] = [
    { header: t(`${c}.event`), accessorKey: (row) => <code className="font-mono text-xs">{row.eventType}</code> },
    {
      header: t(`${c}.status`),
      accessorKey: (row) => {
        const kind = deliveryKind(row.status);
        return <StatusBadge status={BADGE[kind]}>{tk(`tenantIntegrations.webhooks.diagnostics.status.${kind}`)}</StatusBadge>;
      },
    },
    { header: t(`${c}.attempts`), accessorKey: (row) => row.attempts },
    {
      header: t(`${c}.response`),
      accessorKey: (row) => {
        const outcome = deliveryOutcome(row);
        return (
          <span className="flex flex-col gap-0.5">
            <span>{outcome.status ?? t(`${d}.noResponse`)}</span>
            {outcome.error && <span className="break-words text-xs text-destructive">{outcome.error}</span>}
            {row.responseBody && <code className="line-clamp-2 break-all font-mono text-[11px] text-muted-foreground">{row.responseBody}</code>}
          </span>
        );
      },
    },
    { header: t(`${c}.duration`), accessorKey: (row) => (row.durationMs == null ? t("tenantIntegrations.common.none") : t(`${d}.durationMs`, { ms: row.durationMs })) },
    { header: t(`${c}.when`), accessorKey: (row) => formatDate(row.createdAt, t("tenantIntegrations.common.never")) },
  ];
  const labels = tableLabels({
    searchLabel: "",
    searchPlaceholder: "",
    loading: t(`${d}.loading`),
    emptyTitle: t(`${d}.emptyTitle`),
    emptyDescription: t(`${d}.emptyDescription`),
    filteredEmptyTitle: t(`${d}.emptyTitle`),
    onClearSearch: onRetry,
    onRetry,
    rowActions: (name) => t("common.actions.rowActions", { name }),
  });
  return <ResourceTable columns={columns} rows={[...rows]} status={status} labels={labels} rowActions={actions} />;
}

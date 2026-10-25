import { ResourceTable, type ResourceColumn, type ResourceStatus, type RowAction } from "@repo/ui";
import { tableLabels } from "@/features/applications/components/table-labels";
import { useCopy } from "@/i18n";
import type { ScimTokenRecord } from "../model/types";

export interface ScimTokensTableProps {
  rows: readonly ScimTokenRecord[];
  status: ResourceStatus;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onAdd?: () => void;
  actions?: (row: ScimTokenRecord) => readonly RowAction[];
  formatDate: (iso: string | null | undefined, fallback: string) => string;
}

export function ScimTokensTable({ rows, status, search, onSearchChange, onRetry, onAdd, actions, formatDate }: ScimTokensTableProps) {
  const { t } = useCopy();
  const c = "tenantIntegrations.scim.columns" as const;
  const never = t("tenantIntegrations.common.never");
  const columns: ResourceColumn<ScimTokenRecord>[] = [
    { header: t(`${c}.name`), accessorKey: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { header: t(`${c}.lastUsed`), accessorKey: (row) => formatDate(row.lastUsedAt, never) },
    { header: t(`${c}.expires`), accessorKey: (row) => formatDate(row.expiresAt, never) },
    { header: t(`${c}.created`), accessorKey: (row) => formatDate(row.createdAt, never) },
  ];
  const labels = tableLabels({
    searchLabel: t("tenantIntegrations.scim.searchLabel"),
    searchPlaceholder: t("tenantIntegrations.scim.searchPlaceholder"),
    loading: t("tenantIntegrations.scim.loading"),
    emptyTitle: t("tenantIntegrations.scim.emptyTitle"),
    emptyDescription: t("tenantIntegrations.scim.emptyDescription"),
    emptyAction: onAdd ? { label: t("tenantIntegrations.scim.add"), onClick: onAdd } : undefined,
    filteredEmptyTitle: t("tenantIntegrations.scim.filteredEmptyTitle"),
    onClearSearch: () => onSearchChange(""),
    onRetry,
    rowActions: (name) => t("common.actions.rowActions", { name }),
  });
  return (
    <ResourceTable<ScimTokenRecord>
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

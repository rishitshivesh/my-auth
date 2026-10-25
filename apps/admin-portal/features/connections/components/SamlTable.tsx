import { ResourceTable, StatusBadge, type ResourceColumn, type ResourceStatus, type RowAction } from "@repo/ui";
import { tableLabels } from "@/features/applications/components/table-labels";
import { useCopy } from "@/i18n";
import type { SamlServiceProvider } from "../model/types";

export interface SamlTableProps {
  rows: readonly SamlServiceProvider[];
  status: ResourceStatus;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onAdd?: () => void;
  actions?: (row: SamlServiceProvider) => readonly RowAction[];
}

export function SamlTable({ rows, status, search, onSearchChange, onRetry, onAdd, actions }: SamlTableProps) {
  const { t } = useCopy();
  const c = "tenantIntegrations.saml.columns" as const;
  const columns: ResourceColumn<SamlServiceProvider>[] = [
    { header: t(`${c}.name`), accessorKey: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { header: t(`${c}.entityId`), accessorKey: (row) => <code className="break-all font-mono text-xs">{row.entityId}</code> },
    { header: t(`${c}.acs`), accessorKey: (row) => <code className="break-all font-mono text-xs">{row.acsUrl}</code> },
    {
      header: t(`${c}.status`),
      accessorKey: (row) => (
        <StatusBadge status={row.active ? "active" : "suspended"}>
          {t(row.active ? "tenantIntegrations.common.active" : "tenantIntegrations.common.inactive")}
        </StatusBadge>
      ),
    },
  ];
  const labels = tableLabels({
    searchLabel: t("tenantIntegrations.saml.searchLabel"),
    searchPlaceholder: t("tenantIntegrations.saml.searchPlaceholder"),
    loading: t("tenantIntegrations.saml.loading"),
    emptyTitle: t("tenantIntegrations.saml.emptyTitle"),
    emptyDescription: t("tenantIntegrations.saml.emptyDescription"),
    emptyAction: onAdd ? { label: t("tenantIntegrations.saml.add"), onClick: onAdd } : undefined,
    filteredEmptyTitle: t("tenantIntegrations.saml.filteredEmptyTitle"),
    onClearSearch: () => onSearchChange(""),
    onRetry,
    rowActions: (name) => t("common.actions.rowActions", { name }),
  });
  return (
    <ResourceTable<SamlServiceProvider>
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

import { ResourceTable, StatusBadge, type ResourceColumn, type ResourceStatus } from "@repo/ui";
import { useCopy } from "@/i18n";
import { isConfidential } from "../model/clients";
import type { OAuthClient } from "../model/types";
import { tableLabels } from "./table-labels";

export interface ClientsTableProps {
  clients: readonly OAuthClient[];
  status: ResourceStatus;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onOpen: (client: OAuthClient) => void;
  onCreate?: () => void;
}

export function ClientsTable({ clients, status, search, onSearchChange, onRetry, onOpen, onCreate }: ClientsTableProps) {
  const { t } = useCopy();
  const c = "tenantIntegrations.apps.columns" as const;
  const columns: ResourceColumn<OAuthClient>[] = [
    { header: t(`${c}.name`), accessorKey: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    {
      header: t(`${c}.type`),
      accessorKey: (row) => t(isConfidential(row) ? "tenantIntegrations.apps.typeConfidential" : "tenantIntegrations.apps.typePublic"),
    },
    { header: t(`${c}.clientId`), accessorKey: (row) => <code className="break-all font-mono text-xs">{row.clientId}</code> },
    {
      header: t(`${c}.status`),
      accessorKey: (row) => (
        <StatusBadge status={row.isActive ? "active" : "suspended"}>
          {t(row.isActive ? "tenantIntegrations.common.active" : "tenantIntegrations.common.inactive")}
        </StatusBadge>
      ),
    },
    { header: t(`${c}.redirects`), accessorKey: (row) => row.redirectUris.length },
  ];

  const labels = tableLabels({
    searchLabel: t("tenantIntegrations.apps.searchLabel"),
    searchPlaceholder: t("tenantIntegrations.apps.searchPlaceholder"),
    loading: t("tenantIntegrations.apps.loading"),
    emptyTitle: t("tenantIntegrations.apps.emptyTitle"),
    emptyDescription: t("tenantIntegrations.apps.emptyDescription"),
    emptyAction: onCreate ? { label: t("tenantIntegrations.apps.add"), onClick: onCreate } : undefined,
    filteredEmptyTitle: t("tenantIntegrations.apps.filteredEmptyTitle"),
    filteredEmptyDescription: t("tenantIntegrations.apps.filteredEmptyDescription"),
    onClearSearch: () => onSearchChange(""),
    onRetry,
    rowActions: (name) => t("tenantIntegrations.apps.rowActions", { name }),
  });

  return (
    <ResourceTable<OAuthClient>
      columns={columns}
      rows={[...clients]}
      status={status}
      labels={labels}
      searchValue={search}
      onSearchChange={onSearchChange}
      isFiltered={search.trim() !== ""}
      onRowClick={onOpen}
      rowActions={(row) => [{ id: "open", label: t("tenantIntegrations.apps.configure"), onSelect: () => onOpen(row) }]}
    />
  );
}

import { ResourceTable, StatusBadge, type ResourceColumn, type ResourceStatus, type RowAction } from "@repo/ui";
import { tableLabels } from "@/features/applications/components/table-labels";
import { formatDate } from "@/features/applications/model/format";
import { useCopy } from "@/i18n";
import { syncState } from "../model/ldap";
import type { LdapConnection } from "../model/types";

export interface LdapTableProps {
  rows: readonly LdapConnection[];
  status: ResourceStatus;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onAdd?: () => void;
  actions?: (row: LdapConnection) => readonly RowAction[];
}

export function LdapTable({ rows, status, search, onSearchChange, onRetry, onAdd, actions }: LdapTableProps) {
  const { t } = useCopy();
  const c = "tenantIntegrations.ldap.columns" as const;
  const never = t("tenantIntegrations.ldap.syncNever");
  const columns: ResourceColumn<LdapConnection>[] = [
    { header: t(`${c}.name`), accessorKey: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { header: t(`${c}.host`), accessorKey: (row) => <code className="break-all font-mono text-xs">{[row.host, row.port].join(":")}</code> },
    { header: t(`${c}.schedule`), accessorKey: (row) => row.syncSchedule ?? t("tenantIntegrations.common.none") },
    {
      header: t(`${c}.lastSync`),
      accessorKey: (row) => (
        <span className="flex flex-col gap-0.5">
          <span>{formatDate(row.lastSyncAt, never)}</span>
          {syncState(row) !== "never" && (
            <span className="text-xs text-muted-foreground">
              {t("tenantIntegrations.ldap.syncResult", { created: row.lastSyncUsersCreated ?? 0, updated: row.lastSyncUsersUpdated ?? 0 })}
            </span>
          )}
        </span>
      ),
    },
    {
      header: t(`${c}.status`),
      accessorKey: (row) => (
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge status={row.active ? "active" : "suspended"}>
            {t(row.active ? "tenantIntegrations.common.active" : "tenantIntegrations.common.inactive")}
          </StatusBadge>
          {syncState(row) === "failed" && <StatusBadge status="suspended">{t("tenantIntegrations.ldap.syncStatusFailed")}</StatusBadge>}
        </span>
      ),
    },
  ];
  const labels = tableLabels({
    searchLabel: t("tenantIntegrations.ldap.searchLabel"),
    searchPlaceholder: t("tenantIntegrations.ldap.searchPlaceholder"),
    loading: t("tenantIntegrations.ldap.loading"),
    emptyTitle: t("tenantIntegrations.ldap.emptyTitle"),
    emptyDescription: t("tenantIntegrations.ldap.emptyDescription"),
    emptyAction: onAdd ? { label: t("tenantIntegrations.ldap.add"), onClick: onAdd } : undefined,
    filteredEmptyTitle: t("tenantIntegrations.ldap.filteredEmptyTitle"),
    onClearSearch: () => onSearchChange(""),
    onRetry,
    rowActions: (name) => t("common.actions.rowActions", { name }),
  });
  return (
    <ResourceTable<LdapConnection>
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

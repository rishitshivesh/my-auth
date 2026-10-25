import type { ResourceTableLabels, StateViewAction } from "@repo/ui";
import { t } from "@/i18n";

export interface TableLabelInput {
  searchLabel: string;
  searchPlaceholder: string;
  loading: string;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: StateViewAction;
  filteredEmptyTitle: string;
  filteredEmptyDescription?: string;
  onClearSearch: () => void;
  onRetry: () => void;
  /** Accessible name of a row's action menu trigger. */
  rowActions: (name: string) => string;
}

/** Build the full ResourceTable label set from one resource's copy. */
export function tableLabels(
  input: TableLabelInput,
): Omit<ResourceTableLabels, "rowActions"> & { rowActions: (row: { name: string }) => string } {
  const retry = { label: t("common.actions.retry"), onClick: input.onRetry };
  return {
    searchLabel: input.searchLabel,
    searchPlaceholder: input.searchPlaceholder,
    previous: t("common.actions.previous"),
    next: t("common.actions.next"),
    pageStatus: "",
    loading: { title: input.loading },
    empty: { title: input.emptyTitle, description: input.emptyDescription, action: input.emptyAction },
    filteredEmpty: {
      title: input.filteredEmptyTitle,
      description: input.filteredEmptyDescription,
      clear: { label: t("common.actions.clearSearch"), onClick: input.onClearSearch },
    },
    error: { title: t("tenantIntegrations.common.errorTitle"), description: t("tenantIntegrations.common.errorDescription"), retry },
    denied: { title: t("tenantIntegrations.common.deniedTitle"), description: t("tenantIntegrations.common.deniedDescription") },
    unavailable: { title: t("tenantIntegrations.common.errorTitle"), description: t("tenantIntegrations.common.errorDescription"), retry },
    rowActions: (row) => input.rowActions(row.name),
  };
}

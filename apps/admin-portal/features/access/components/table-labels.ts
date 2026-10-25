"use client";

import type { ResourceTableProps } from "@repo/ui";
import { useCopy } from "@/i18n";

/** Catalogue sections that carry the per-table copy (search, empty state). */
export type TableCopyBase =
  | "users.table"
  | "users.invitations.table"
  | "access.roles.table"
  | "access.permissions.table"
  | "access.policies.table"
  | "access.groups.table";

export interface TableLabelOptions<T> {
  base: TableCopyBase;
  rowName: (row: T) => string;
  pageStatus: string;
  onRetry: () => void;
  onClear: () => void;
  /** Primary call to action on the empty state; omit when the viewer cannot create. */
  onCreate?: () => void;
}

/** Builds ResourceTable labels from per-table copy plus the shared state copy. */
export function useTableLabels<T extends { id: string | number }>(
  options: TableLabelOptions<T>,
): ResourceTableProps<T>["labels"] {
  const { t, tk } = useCopy();
  const { base, rowName, pageStatus, onRetry, onClear, onCreate } = options;
  const retry = { label: t("common.actions.retry"), onClick: onRetry };
  return {
    searchLabel: tk(`${base}.searchLabel`),
    searchPlaceholder: tk(`${base}.searchPlaceholder`),
    previous: t("common.actions.previous"),
    next: t("common.actions.next"),
    pageStatus,
    rowActions: (row) => t("common.actions.rowActions", { name: rowName(row) }),
    loading: { title: t("states.loading.title") },
    empty: {
      title: tk(`${base}.emptyTitle`),
      description: tk(`${base}.emptyDescription`),
      action: onCreate ? { label: tk(`${base}.emptyAction`), onClick: onCreate } : undefined,
    },
    filteredEmpty: {
      title: t("states.filteredEmpty.title"),
      description: t("states.filteredEmpty.description"),
      clear: { label: t("common.actions.clearFilters"), onClick: onClear },
    },
    error: { title: t("states.error.title"), description: t("states.error.description"), retry },
    denied: { title: t("states.denied.title"), description: t("states.denied.description") },
    unavailable: { title: t("states.unavailable.title"), description: t("states.unavailable.description"), retry },
  };
}

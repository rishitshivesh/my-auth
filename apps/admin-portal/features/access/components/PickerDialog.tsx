"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useCopy } from "@/i18n";
import { CheckList, type CheckItem } from "./CheckList";
import { FormDialog } from "./FormDialog";

export interface PickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  legend: string;
  items: readonly CheckItem[];
  emptyText: string;
  confirmLabel: string;
  pending: boolean;
  error?: string;
  /** Rendered above the list, e.g. a search field. */
  toolbar?: ReactNode;
  onConfirm: (ids: string[]) => void;
}

/** Multi-select dialog used to attach permissions, policies, members and roles. */
export function PickerDialog({
  open, onOpenChange, title, description, legend, items, emptyText, confirmLabel, pending, error, toolbar, onConfirm,
}: PickerDialogProps) {
  const { t } = useCopy();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      cancelLabel={t("common.actions.cancel")}
      pending={pending}
      error={error}
      submitDisabled={picked.size === 0}
      onSubmit={() => onConfirm([...picked])}
    >
      {toolbar}
      <CheckList legend={legend} items={items} selected={picked} onToggle={toggle} emptyText={emptyText} />
      <p aria-live="polite" className="font-body text-xs text-muted-foreground">
        {t("access.common.selectedCount", { count: picked.size })}
      </p>
    </FormDialog>
  );
}

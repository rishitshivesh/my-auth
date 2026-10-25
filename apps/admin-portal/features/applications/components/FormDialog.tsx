"use client";

import type { FormEvent, ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SentryButton,
} from "@repo/ui";
import { useCopy } from "@/i18n";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => void | Promise<void>;
  pending?: boolean;
  /** Server error; announced assertively and never implies success. */
  error?: string;
  children: ReactNode;
}

/** Accessible form modal: focus trap and return come from Radix; Enter submits. */
export function FormDialog({
  open, onOpenChange, title, description, submitLabel, onSubmit, pending, error, children,
}: FormDialogProps) {
  const { t } = useCopy();
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {children}
          {error && <p role="alert" className="font-body text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <SentryButton type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("common.actions.cancel")}
            </SentryButton>
            <SentryButton type="submit" variant="primary" isLoading={pending}>{submitLabel}</SentryButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

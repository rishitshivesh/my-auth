"use client";

import type { FormEvent, ReactNode } from "react";
import { SentryButton } from "@repo/ui";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@repo/ui/components/ui/dialog";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  submitLabel: string;
  cancelLabel: string;
  onSubmit: () => void;
  pending?: boolean;
  submitDisabled?: boolean;
  /** Server error to show; the dialog stays open so nothing implies success. */
  error?: string;
  /** Hides the submit button, e.g. on a result step. */
  hideSubmit?: boolean;
  wide?: boolean;
}

/** Accessible form dialog: Radix traps focus, returns it to the trigger and closes on Escape. */
export function FormDialog({
  open, onOpenChange, title, description, children, submitLabel, cancelLabel, onSubmit, pending,
  submitDisabled, error, hideSubmit, wide,
}: FormDialogProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && !submitDisabled) onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className={wide ? "max-h-[90dvh] overflow-y-auto sm:max-w-2xl" : "max-h-[90dvh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className="font-display break-words">{title}</DialogTitle>
          {description && <DialogDescription className="font-body break-words">{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {children}
          {error && <p role="alert" className="font-body text-sm text-destructive break-words">{error}</p>}
          <DialogFooter className="gap-2">
            <SentryButton type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </SentryButton>
            {!hideSubmit && (
              <SentryButton type="submit" variant="primary" isLoading={pending} disabled={submitDisabled}>
                {submitLabel}
              </SentryButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

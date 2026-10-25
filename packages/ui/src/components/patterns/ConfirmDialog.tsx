'use client';

import * as React from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { SentryButton } from '../sentry/SentryButton';
import { SentryInput } from '../sentry/SentryInput';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One sentence on what is being confirmed. */
  description: string;
  /** Concrete consequences, shown as a list before the buttons. */
  effects?: readonly string[];
  effectsHeading?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  /** Awaited on confirm; the dialog stays open while pending and on error. */
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  /** Server error to display (never implies success). */
  error?: string;
  /** Require typing this phrase before confirm enables. */
  confirmPhrase?: string;
  confirmPhraseLabel?: string;
  /**
   * When recent sign-in is required and not satisfied, the confirm button is
   * replaced by a re-authentication action.
   */
  recentAuth?: { required: boolean; notice: string; actionLabel: string; onReauthenticate: () => void };
}

/**
 * Radix AlertDialog gives focus trap, Escape to cancel and focus return to the
 * trigger on close. Cancel is the initial focus so destructive actions are
 * never one Enter away.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, effects, effectsHeading, confirmLabel, cancelLabel, destructive,
  onConfirm, pending, error, confirmPhrase, confirmPhraseLabel, recentAuth,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const phraseOk = !confirmPhrase || typed === confirmPhrase;
  const needsReauth = recentAuth?.required === true;

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {effects && effects.length > 0 && (
          <section aria-label={effectsHeading} className="space-y-2">
            {effectsHeading && (
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {effectsHeading}
              </h3>
            )}
            <ul className="list-disc space-y-1 pl-5 font-body text-sm text-foreground">
              {effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          </section>
        )}
        {confirmPhrase && !needsReauth && (
          <SentryInput
            label={confirmPhraseLabel}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {needsReauth && recentAuth && (
          <p role="status" className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">
            {recentAuth.notice}
          </p>
        )}
        {error && <p role="alert" className="font-body text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <SentryButton ref={cancelRef} variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </SentryButton>
          {needsReauth && recentAuth ? (
            <SentryButton variant="primary" onClick={recentAuth.onReauthenticate}>
              {recentAuth.actionLabel}
            </SentryButton>
          ) : (
            <SentryButton
              variant={destructive ? 'destructive' : 'primary'}
              isLoading={pending}
              disabled={!phraseOk}
              onClick={() => { void onConfirm(); }}
            >
              {confirmLabel}
            </SentryButton>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

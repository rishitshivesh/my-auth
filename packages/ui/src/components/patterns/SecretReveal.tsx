'use client';

import * as React from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { copyText } from '../../lib/clipboard';
import { SentryButton } from '../sentry/SentryButton';

export interface SecretRevealLabels {
  warning: string;
  copy: string;
  copied: string;
  copyFailed: string;
  show: string;
  hide: string;
  hiddenValue: string;
  acknowledge: string;
}

export interface SecretRevealProps {
  /** The one-time secret. The parent must drop it from state once acknowledged. */
  secret: string;
  labels: SecretRevealLabels;
  /** Called when the user confirms they stored it; parent then discards the secret. */
  onAcknowledge: () => void;
  /** Auto-hide delay in ms (0 disables). */
  autoHideMs?: number;
  copyFeedbackMs?: number;
  /** Accessible name of the secret field. */
  fieldLabel: string;
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function SecretReveal({
  secret, labels, onAcknowledge, autoHideMs = 0, copyFeedbackMs = 2000, fieldLabel, className,
}: SecretRevealProps) {
  const [visible, setVisible] = React.useState(false);
  const [copyState, setCopyState] = React.useState<CopyState>('idle');

  React.useEffect(() => {
    if (!visible || autoHideMs <= 0) return;
    const timer = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(timer);
  }, [visible, autoHideMs]);

  React.useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), copyFeedbackMs);
    return () => clearTimeout(timer);
  }, [copyState, copyFeedbackMs]);

  const onCopy = async () => setCopyState((await copyText(secret)) ? 'copied' : 'failed');

  return (
    <div className={cn('space-y-3', className)}>
      <p className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">
        {labels.warning}
      </p>
      <div className="flex items-center gap-2">
        <output
          aria-label={fieldLabel}
          className="min-w-0 flex-1 break-all rounded-sm border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground"
        >
          {visible ? secret : labels.hiddenValue}
        </output>
        <SentryButton
          variant="icon"
          size="icon"
          aria-label={visible ? labels.hide : labels.show}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </SentryButton>
        <SentryButton variant="outline" size="sm" onClick={onCopy}>
          {copyState === 'copied' ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
          {labels.copy}
        </SentryButton>
      </div>
      <p role="status" aria-live="polite" className="min-h-4 font-body text-xs text-muted-foreground">
        {copyState === 'copied' ? labels.copied : copyState === 'failed' ? labels.copyFailed : ''}
      </p>
      <SentryButton variant="primary" onClick={onAcknowledge}>{labels.acknowledge}</SentryButton>
    </div>
  );
}

'use client';

import * as React from 'react';
import { CheckCircle2, Clock, Link2Off, Loader2, ShieldAlert, UserX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SentryButton } from '../sentry/SentryButton';

export type LinkLandingStatus =
  | 'loading' | 'valid' | 'pending' | 'expired' | 'used' | 'invalid' | 'wrong-account';

export interface LinkLandingCopy {
  title: string;
  description: string;
  /** Primary action label (absent for loading/pending). */
  action?: string;
  /** Secondary action label. */
  secondaryAction?: string;
}

export interface LinkLandingProps {
  status: LinkLandingStatus;
  /** Localised copy for the CURRENT status (caller resolves from its catalogue). */
  copy: LinkLandingCopy;
  /**
   * Intentional continuation: the link is only consumed when the user presses
   * the primary action in the valid state, never by merely loading this page
   * (mail scanners prefetch GETs).
   */
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** Hint for opening the link on another device (code fallback). */
  alternateDeviceHint?: string;
  /** Small context lines, e.g. account and workspace. */
  details?: readonly string[];
  className?: string;
}

const ICONS: Record<LinkLandingStatus, LucideIcon> = {
  loading: Loader2,
  pending: Loader2,
  valid: CheckCircle2,
  expired: Clock,
  used: Link2Off,
  invalid: ShieldAlert,
  'wrong-account': UserX,
};

export function LinkLanding({
  status, copy, onPrimary, onSecondary, alternateDeviceHint, details, className,
}: LinkLandingProps) {
  const Icon = ICONS[status];
  const busy = status === 'loading' || status === 'pending';
  const isProblem = status === 'expired' || status === 'used' || status === 'invalid' || status === 'wrong-account';
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Move focus to the heading when the outcome changes so it is announced.
  React.useEffect(() => {
    headingRef.current?.focus();
  }, [status]);

  return (
    <div
      data-status={status}
      role={isProblem ? 'alert' : 'status'}
      aria-busy={busy || undefined}
      className={cn('flex flex-col items-center gap-3 text-center', className)}
    >
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full',
          isProblem ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-success-text',
        )}
      >
        <Icon aria-hidden="true" className={cn('h-6 w-6', busy && 'animate-spin motion-reduce:animate-none')} />
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-foreground outline-none">
        {copy.title}
      </h2>
      <p className="max-w-sm font-body text-sm text-muted-foreground">{copy.description}</p>
      {details && details.length > 0 && (
        <ul className="font-mono text-xs text-muted-foreground">
          {details.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {!busy && (copy.action || copy.secondaryAction) && (
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {copy.action && (
            <SentryButton variant="accent" onClick={onPrimary}>{copy.action}</SentryButton>
          )}
          {copy.secondaryAction && (
            <SentryButton variant="outline" onClick={onSecondary}>{copy.secondaryAction}</SentryButton>
          )}
        </div>
      )}
      {status === 'valid' && alternateDeviceHint && (
        <p className="font-body text-xs text-muted-foreground">{alternateDeviceHint}</p>
      )}
    </div>
  );
}

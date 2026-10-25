import * as React from 'react';
import { AlertTriangle, CloudOff, FileQuestion, Inbox, Lock, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SentryButton } from '../sentry/SentryButton';
import { SentrySkeleton } from '../sentry/SentrySkeleton';

export type StateKind =
  | 'loading' | 'empty' | 'filtered-empty' | 'error' | 'denied' | 'not-found' | 'unavailable';

const ICONS: Record<Exclude<StateKind, 'loading'>, LucideIcon> = {
  empty: Inbox,
  'filtered-empty': SearchX,
  error: AlertTriangle,
  denied: Lock,
  'not-found': FileQuestion,
  unavailable: CloudOff,
};

/** Failures interrupt screen readers; neutral states are polite. */
const ASSERTIVE: ReadonlySet<StateKind> = new Set(['error', 'unavailable']);

export interface StateViewAction {
  label: string;
  onClick: () => void;
  pending?: boolean;
}

export interface StateViewProps {
  kind: StateKind;
  title: string;
  description?: string;
  /** Primary recovery action (retry, clear filters, create...). */
  action?: StateViewAction;
  secondaryAction?: StateViewAction;
  /** Support reference such as a request id. */
  reference?: string;
  className?: string;
}

export function StateView({ kind, title, description, action, secondaryAction, reference, className }: StateViewProps) {
  if (kind === 'loading') {
    return (
      <div role="status" aria-busy="true" aria-live="polite" className={cn('space-y-3 p-6', className)}>
        <span className="sr-only">{title}</span>
        <SentrySkeleton className="h-6 w-1/3" />
        <SentrySkeleton className="h-16 w-full" />
        <SentrySkeleton className="h-16 w-full" />
      </div>
    );
  }
  const Icon = ICONS[kind];
  const role = ASSERTIVE.has(kind) ? 'alert' : 'status';
  return (
    <div
      role={role}
      data-state={kind}
      className={cn('flex flex-col items-center justify-center gap-2 p-8 text-center', className)}
    >
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
        <Icon aria-hidden="true" className={cn('h-6 w-6', kind === 'error' ? 'text-destructive' : 'text-muted-foreground')} />
      </div>
      <h2 className="font-display text-lg font-medium text-foreground">{title}</h2>
      {description && <p className="max-w-md font-body text-sm text-muted-foreground">{description}</p>}
      {reference && <p className="font-mono text-xs text-muted-foreground">{reference}</p>}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <SentryButton variant="accent" onClick={action.onClick} isLoading={action.pending}>
              {action.label}
            </SentryButton>
          )}
          {secondaryAction && (
            <SentryButton variant="outline" onClick={secondaryAction.onClick} isLoading={secondaryAction.pending}>
              {secondaryAction.label}
            </SentryButton>
          )}
        </div>
      )}
    </div>
  );
}

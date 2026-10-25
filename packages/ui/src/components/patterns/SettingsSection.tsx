import * as React from 'react';
import { cn } from '../../lib/utils';
import { GlassCard } from '../sentry/GlassCard';
import { SentryButton } from '../sentry/SentryButton';
import { StateView, type StateKind } from './StateView';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Block the body with a state instead of the form (loading/error/denied). */
  state?: { kind: Extract<StateKind, 'loading' | 'error' | 'denied' | 'unavailable'>; title: string; description?: string; retry?: { label: string; onClick: () => void } };
  /** Form dirty? Enables Save/Discard. */
  dirty?: boolean;
  pending?: boolean;
  invalid?: boolean;
  error?: string;
  /** Truthful success text; set only after the server confirmed. */
  savedMessage?: string;
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  /** For read-only users: hides actions. */
  readOnly?: boolean;
  className?: string;
}

export function SettingsSection({
  title, description, children, state, dirty, pending, invalid, error, savedMessage, onSave, onDiscard,
  saveLabel, discardLabel, readOnly, className,
}: SettingsSectionProps) {
  const headingId = React.useId();
  const showActions = !readOnly && !state && onSave && saveLabel;
  return (
    <GlassCard tier={1} className={cn('p-6', className)}>
      <section aria-labelledby={headingId} className="space-y-4">
        <header className="space-y-1">
          <h2 id={headingId} className="font-display text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="font-body text-sm text-muted-foreground">{description}</p>}
        </header>
        {state ? (
          <StateView
            kind={state.kind}
            title={state.title}
            description={state.description}
            action={state.retry}
          />
        ) : (
          <div className="space-y-4">{children}</div>
        )}
        {error && <p role="alert" className="font-body text-sm text-destructive">{error}</p>}
        {savedMessage && !dirty && <p role="status" className="font-body text-sm text-success-text">{savedMessage}</p>}
        {showActions && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            {onDiscard && discardLabel && (
              <SentryButton variant="ghost" disabled={!dirty || pending} onClick={onDiscard}>
                {discardLabel}
              </SentryButton>
            )}
            <SentryButton variant="primary" isLoading={pending} disabled={!dirty || invalid} onClick={onSave}>
              {saveLabel}
            </SentryButton>
          </div>
        )}
      </section>
    </GlassCard>
  );
}

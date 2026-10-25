import * as React from 'react';
import { ClipboardList, FileWarning } from 'lucide-react';
import { cn } from '../../lib/utils';
import { GlassCard } from '../sentry/GlassCard';

export interface ProposedCapabilityProps {
  title: string;
  summary: string;
  /** Badge text, e.g. "Planned". */
  badgeLabel: string;
  /** Sentence stating nothing here is live. */
  intro: string;
  todoHeading: string;
  /** Handoff requirements the implementation must meet. */
  requirements: readonly string[];
  contractHeading: string;
  /** What the backend must provide before this can ship. */
  missingContract: string;
  className?: string;
}

/**
 * Honest placeholder for a designed-but-unbuilt capability. Intentionally has
 * no inputs, buttons, sample rows or success states: it can never be mistaken
 * for working functionality.
 */
export function ProposedCapability({
  title, summary, badgeLabel, intro, todoHeading, requirements, contractHeading, missingContract, className,
}: ProposedCapabilityProps) {
  return (
    <GlassCard tier={1} className={cn('space-y-5 p-6', className)} data-capability-state="proposed">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          <span className="inline-flex items-center rounded-xs border border-border bg-muted px-2 py-0.5 font-display text-[11px] font-semibold text-muted-foreground">
            {badgeLabel}
          </span>
        </div>
        <p className="font-body text-sm text-muted-foreground">{summary}</p>
        <p className="font-body text-sm text-foreground">{intro}</p>
      </header>
      <section aria-label={todoHeading} className="rounded-sm border border-dashed border-border bg-muted p-4">
        <h3 className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
          <ClipboardList aria-hidden="true" className="h-4 w-4" />
          {todoHeading}
        </h3>
        <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-foreground">
          {requirements.map((req) => <li key={req}>{req}</li>)}
        </ul>
      </section>
      <section aria-label={contractHeading} className="rounded-sm border border-dashed border-warning/60 bg-muted p-4">
        <h3 className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold text-warning-text">
          <FileWarning aria-hidden="true" className="h-4 w-4" />
          {contractHeading}
        </h3>
        <p className="font-mono text-xs text-foreground">{missingContract}</p>
      </section>
    </GlassCard>
  );
}

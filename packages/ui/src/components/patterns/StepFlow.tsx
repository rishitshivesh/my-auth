import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FlowStep {
  id: string;
  label: string;
}

export interface StepFlowProps {
  steps: readonly FlowStep[];
  currentId: string;
  /** "Step 2 of 4" style text, localised by the caller. */
  progressLabel: string;
  /** Per-step accessible text, e.g. "Step 2: Password". */
  stepLabel: (step: FlowStep, index: number) => string;
  children: React.ReactNode;
  className?: string;
}

export function StepFlow({ steps, currentId, progressLabel, stepLabel, children, className }: StepFlowProps) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === currentId));
  return (
    <div className={cn('w-full space-y-6', className)}>
      <div>
        <p className="sr-only" aria-live="polite">{progressLabel}</p>
        <ol className="flex items-center gap-2">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            return (
              <li
                key={step.id}
                aria-current={current ? 'step' : undefined}
                className="flex flex-1 items-center gap-2"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-display text-[11px] font-semibold',
                    done && 'border-accent bg-accent text-accent-foreground',
                    current && 'border-accent text-foreground',
                    !done && !current && 'border-border text-muted-foreground',
                  )}
                >
                  {done ? <Check aria-hidden="true" className="h-3 w-3" /> : index + 1}
                </span>
                <span className="sr-only">{stepLabel(step, index)}</span>
                <span
                  aria-hidden="true"
                  className={cn('hidden truncate font-display text-xs sm:inline', current ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <span aria-hidden="true" className={cn('h-px flex-1', done ? 'bg-accent' : 'bg-border')} />
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div>{children}</div>
    </div>
  );
}

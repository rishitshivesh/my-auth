import * as React from 'react';
import { cn } from '../../lib/utils';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FormFieldProps {
  label: string;
  /** Render prop receives the ids/aria wiring to spread on the control. */
  children: (control: FieldControlProps) => React.ReactNode;
  hint?: string;
  /** Inline validation message; show only after the field was touched. */
  error?: string;
  required?: boolean;
  /** Visible marker text for optional fields, e.g. "Optional". */
  optionalLabel?: string;
  className?: string;
}

export function FormField({ label, children, hint, error, required, optionalLabel, className }: FormFieldProps) {
  const uid = React.useId();
  const id = `${uid}-control`;
  const hintId = hint ? `${uid}-hint` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block font-display text-[13px] font-medium text-foreground">
          {label}
        </label>
        {!required && optionalLabel && (
          <span className="font-body text-xs text-muted-foreground">{optionalLabel}</span>
        )}
      </div>
      {children(control)}
      {hint && !error && (
        <p id={hintId} className="font-body text-xs text-muted-foreground">{hint}</p>
      )}
      {/* Always mounted so the live region announces a newly inserted message. */}
      <p id={errorId} role="alert" className={cn('font-body text-xs text-destructive', !error && 'sr-only')}>
        {error}
      </p>
    </div>
  );
}

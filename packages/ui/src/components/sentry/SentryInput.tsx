import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SentryInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const SentryInput = React.forwardRef<HTMLInputElement, SentryInputProps>(
  ({ className, type, label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            'flex h-[42px] w-full rounded-sm border border-border bg-black/5 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 transition-all font-body',
            error && 'border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive',
            className
          )}
          ref={ref}
          {...props}
        />
        {(error || helperText) && (
          <p className={cn(
            'text-[11px] font-body',
            error ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);
SentryInput.displayName = 'SentryInput';

export { SentryInput };

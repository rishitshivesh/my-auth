import { cn } from "@repo/ui/lib/utils";

export interface FormAlertProps {
  message?: string;
  /** Small support reference, e.g. a request id. */
  reference?: string;
  className?: string;
}

/**
 * Form-level error. The region stays mounted so screen readers announce a message
 * the moment it is inserted (role=alert is assertive).
 */
export function FormAlert({ message, reference, className }: FormAlertProps) {
  return (
    <div role="alert" className={cn(message ? "rounded-sm border border-destructive/40 bg-destructive/10 p-3" : "sr-only", className)}>
      {message && <p className="font-body text-sm text-destructive">{message}</p>}
      {message && reference && <p className="mt-1 font-mono text-xs text-muted-foreground">{reference}</p>}
    </div>
  );
}

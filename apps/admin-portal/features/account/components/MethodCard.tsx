import type { ReactNode } from "react";
import { GlassCard } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";

export interface MethodCardProps {
  id: string;
  title: string;
  description?: string;
  /** Non-colour status text, e.g. "Enabled". */
  status?: string;
  statusTone?: "ok" | "neutral" | "warn";
  actions?: ReactNode;
  children?: ReactNode;
}

/** One sign-in method or recovery option as a labelled region. */
export function MethodCard({ id, title, description, status, statusTone = "neutral", actions, children }: MethodCardProps) {
  const headingId = `${id}-title`;
  return (
    <GlassCard tier={1} className="p-6">
      <section aria-labelledby={headingId} className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id={headingId} className="font-display text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="font-body text-sm text-muted-foreground">{description}</p>}
            {status && (
              <p
                className={cn(
                  "font-body text-sm font-medium",
                  statusTone === "ok" && "text-success-text",
                  statusTone === "warn" && "text-warning-text",
                  statusTone === "neutral" && "text-foreground",
                )}
              >
                {status}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </section>
    </GlassCard>
  );
}

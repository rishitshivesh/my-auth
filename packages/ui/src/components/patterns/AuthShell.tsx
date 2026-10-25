import * as React from 'react';
import { cn } from '../../lib/utils';
import { brandStyle } from '../../lib/brand-color';
import { GlassCard } from '../sentry/GlassCard';

export interface AuthShellProps {
  title: string;
  description?: string;
  /** Tenant or product mark (logo image or wordmark). */
  brand?: React.ReactNode;
  /** Tenant brand colour; validated and contrast-checked, else theme accent is used. */
  brandColor?: string | null;
  /** Secondary actions under the card (switch method, help, legal). */
  footer?: React.ReactNode;
  /** Name of the workspace shown above the card, e.g. "Workspace: Acme". */
  contextLabel?: string;
  /** Accessible name of the landmark. */
  landmarkLabel: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Hosted identity layout. Single column, 320px safe, centered card, optional
 * tenant branding limited to a validated accent colour and logo.
 */
export function AuthShell({
  title, description, brand, brandColor, footer, contextLabel, landmarkLabel, children, className,
}: AuthShellProps) {
  return (
    <div
      style={brandStyle(brandColor) as React.CSSProperties}
      className="flex min-h-dvh w-full min-w-[320px] flex-col items-center justify-center bg-background px-4 py-8 sm:px-6"
    >
      <main aria-label={landmarkLabel} className={cn('w-full max-w-md space-y-6', className)}>
        {brand && <div className="flex justify-center">{brand}</div>}
        <GlassCard tier={2} className="space-y-6 p-6 sm:p-8">
          <header className="space-y-1.5 text-center">
            {contextLabel && (
              <p className="font-display text-xs font-medium text-muted-foreground">{contextLabel}</p>
            )}
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            {description && <p className="font-body text-sm text-muted-foreground">{description}</p>}
          </header>
          {children}
        </GlassCard>
        {footer && <footer className="text-center font-body text-sm text-muted-foreground">{footer}</footer>}
      </main>
    </div>
  );
}

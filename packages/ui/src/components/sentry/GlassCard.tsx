import React from 'react';
import { cn } from '../../lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: 1 | 2 | 3;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, tier = 1, children, ...props }, ref) => {
    const tierStyles = {
      1: 'bg-[var(--glass-1-bg)] backdrop-blur-[var(--glass-1-blur)] border-[rgba(255,255,255,0.55)]',
      2: 'bg-[var(--glass-2-bg)] backdrop-blur-[var(--glass-2-blur)] border-[rgba(255,255,255,0.60)] shadow-lg',
      3: 'bg-[var(--glass-3-bg)] backdrop-blur-[var(--glass-3-blur)] border-[rgba(255,255,255,0.70)] shadow-xl',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border relative overflow-hidden transition-all duration-200',
          'before:absolute before:inset-0 before:pointer-events-none before:border-t before:border-l before:border-[rgba(255,255,255,0.4)] before:rounded-[inherit]',
          tierStyles[tier],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

import React from 'react';
import { cn } from '../../lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: 1 | 2 | 3;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, tier = 1, children, ...props }, ref) => {
    const tierStyles = {
      1: 'bg-[var(--glass-1-bg)] backdrop-blur-[var(--glass-1-blur)] border-[var(--glass-1-border)]',
      2: 'bg-[var(--glass-2-bg)] backdrop-blur-[var(--glass-2-blur)] border-[var(--glass-2-border)] shadow-lg',
      3: 'bg-[var(--glass-3-bg)] backdrop-blur-[var(--glass-3-blur)] border-[var(--glass-3-border)] shadow-xl',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border relative overflow-hidden transition-all duration-200',
          'before:absolute before:inset-0 before:pointer-events-none before:border-t before:border-l before:border-[var(--glass-stroke)] before:rounded-[inherit]',
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

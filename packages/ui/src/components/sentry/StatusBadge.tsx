import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Lock } from 'lucide-react';

const sentryBadgeVariants = cva(
  'inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-display font-semibold transition-colors',
  {
    variants: {
      status: {
        active: 'bg-[rgba(42,191,108,0.1)] text-[#1D8F50] border-[rgba(42,191,108,0.22)]',
        pending: 'bg-[rgba(196,131,10,0.1)] text-[#C4830A] border-[rgba(196,131,10,0.22)]',
        suspended: 'bg-[rgba(192,57,43,0.08)] text-[#C0392B] border-[rgba(192,57,43,0.22)]',
        admin: 'bg-[rgba(37,99,235,0.08)] text-[#2563EB] border-[rgba(37,99,235,0.22)]',
        mfa: 'bg-[rgba(42,191,108,0.1)] text-[#1D8F50] border-[rgba(42,191,108,0.22)] gap-1',
        system: 'bg-black/5 text-muted-foreground border-border',
      },
    },
    defaultVariants: {
      status: 'active',
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof sentryBadgeVariants> {}

function StatusBadge({ className, status, children, ...props }: StatusBadgeProps) {
  return (
    <div className={cn(sentryBadgeVariants({ status }), className)} {...props}>
      {status === 'mfa' && <Lock className="w-3 h-3" />}
      {children || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '')}
    </div>
  );
}

export { StatusBadge, sentryBadgeVariants };


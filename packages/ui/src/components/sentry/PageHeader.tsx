import * as React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-8 animate-fade-up', className)}>
      <div className="space-y-1">
        <h1 className="text-xl font-display font-semibold text-foreground tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm font-body text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-3">
          {action}
        </div>
      )}
    </div>
  );
}

import * as React from 'react';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';
import { SentryButton } from './SentryButton';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-12 text-center animate-fade-in',
      className
    )}>
      <div className="w-16 h-16 rounded-md bg-black/5 flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-lg font-display font-medium text-foreground mb-2">
        {title}
      </h3>
      <p className="text-sm font-body text-muted-foreground max-w-[280px] mb-8">
        {description}
      </p>
      {action && (
        <SentryButton onClick={action.onClick} variant="accent">
          {action.label}
        </SentryButton>
      )}
    </div>
  );
}

import * as React from 'react';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { LucideIcon } from 'lucide-react';

interface AuditEvent {
  id: string;
  type: string;
  description: string;
  timestamp: Date | string;
  icon?: LucideIcon;
  metadata?: Record<string, any>;
}

interface AuditTimelineProps {
  events: AuditEvent[];
  className?: string;
}

export function AuditTimeline({ events, className }: AuditTimelineProps) {
  return (
    <div className={cn('relative space-y-6', className)}>
      <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />
      {events.map((event, index) => (
        <div key={event.id} className="relative pl-10 animate-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
          <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center z-10">
            {event.icon ? (
              <event.icon className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-display font-semibold text-foreground">
                {event.type}
              </p>
              <time className="text-[11px] font-mono text-muted-foreground">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </time>
            </div>
            <p className="text-sm font-body text-muted-foreground">
              {event.description}
            </p>
            {event.metadata && (
              <div className="mt-2 p-2 rounded-sm bg-black/5 border border-border overflow-x-auto">
                <pre className="text-[11px] font-mono text-muted-foreground">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

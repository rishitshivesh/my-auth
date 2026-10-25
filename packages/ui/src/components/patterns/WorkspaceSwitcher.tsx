'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { SentryButton } from '../sentry/SentryButton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface WorkspaceOption {
  slug: string;
  name: string;
}

export interface WorkspaceSwitcherProps {
  workspaces: readonly WorkspaceOption[];
  currentSlug: string;
  /** Display name for the trigger when the current workspace is not in the list yet. */
  currentName?: string;
  status: 'loading' | 'ready' | 'error';
  onSelect: (slug: string) => void;
  labels: { trigger: string; heading: string; none: string; loading: string; error: string; note: string };
}

export function WorkspaceSwitcher({ workspaces, currentSlug, currentName, status, onSelect, labels }: WorkspaceSwitcherProps) {
  const current = workspaces.find((w) => w.slug === currentSlug);
  const display = current?.name ?? currentName ?? currentSlug;
  const others = workspaces.filter((w) => w.slug !== currentSlug);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SentryButton variant="outline" size="sm" aria-label={`${labels.trigger}: ${display}`} className="max-w-[200px] justify-between gap-2">
          <span className="truncate">{display}</span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0" />
        </SentryButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{labels.heading}</DropdownMenuLabel>
        {status === 'loading' && <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">{labels.loading}</p>}
        {status === 'error' && <p role="alert" className="px-2 py-1.5 text-sm text-destructive">{labels.error}</p>}
        {status === 'ready' && (
          <>
            <DropdownMenuItem disabled>
              <Check aria-hidden="true" className="h-4 w-4" />
              <span className="truncate">{display}</span>
            </DropdownMenuItem>
            {others.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{labels.none}</p>}
            {others.map((w) => (
              <DropdownMenuItem key={w.slug} onSelect={() => onSelect(w.slug)}>
                <span className="truncate">{w.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{labels.note}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';

export interface CommandEntry {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Extra search terms. */
  keywords?: readonly string[];
  onSelect: () => void;
}

export interface CommandGroupData {
  id: string;
  heading: string;
  entries: readonly CommandEntry[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly CommandGroupData[];
  title: string;
  description: string;
  placeholder: string;
  emptyLabel: string;
}

/** Palette shell: callers decide which entries exist (permission-filtered nav + actions). */
export function CommandPalette({ open, onOpenChange, groups, title, description, placeholder, emptyLabel }: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <CommandInput placeholder={placeholder} aria-label={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.id} heading={group.heading}>
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <CommandItem
                  key={entry.id}
                  value={entry.label}
                  keywords={entry.keywords ? [...entry.keywords] : undefined}
                  onSelect={() => { onOpenChange(false); entry.onSelect(); }}
                >
                  {Icon && <Icon aria-hidden="true" />}
                  <span>{entry.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Cmd/Ctrl+K toggles the palette. Returns nothing; attach once per shell. */
export function useCommandShortcut(toggle: () => void): void {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

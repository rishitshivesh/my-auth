'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { User } from 'lucide-react';
import { SentryButton } from '../sentry/SentryButton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface AccountMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

export interface AccountMenuProps {
  /** e.g. "Signed in as ada@example.com" (already localised). */
  identityLabel: string;
  triggerLabel: string;
  items: readonly AccountMenuItem[];
  /** Rendered after a separator, typically sign out. */
  footerItems?: readonly AccountMenuItem[];
}

function renderItem(item: AccountMenuItem) {
  const Icon = item.icon;
  return (
    <DropdownMenuItem key={item.id} variant={item.destructive ? 'destructive' : 'default'} onSelect={item.onSelect}>
      {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
      {item.label}
    </DropdownMenuItem>
  );
}

export function AccountMenu({ identityLabel, triggerLabel, items, footerItems }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SentryButton variant="icon" size="icon" aria-label={triggerLabel} className="rounded-full">
          <User aria-hidden="true" className="h-4 w-4" />
        </SentryButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate font-body text-xs text-muted-foreground">{identityLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(renderItem)}
        {footerItems && footerItems.length > 0 && <DropdownMenuSeparator />}
        {footerItems?.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

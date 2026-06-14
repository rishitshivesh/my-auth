'use client';

import * as React from 'react';
import { ThemeToggle, SentryButton } from "@repo/ui";
import { TenantSwitcher } from './tenant-switcher';
import { UserMenu } from './user-menu';
import { Bell } from 'lucide-react';



interface TopbarProps {
  title?: string;
  subtitle?: string;
  tenants?: any[];
  current?: string;
}

export function Topbar({ title, subtitle, tenants, current }: TopbarProps) {
  return (
    <header className="h-16 flex items-center justify-between px-8 bg-card/50 backdrop-blur-md border-b border-border z-10">
      <div className="flex items-center gap-8">
        <TenantSwitcher tenants={tenants} current={current} />

        
        {title && (
          <div className="flex items-center gap-3">
            <div className="w-px h-6 bg-border" />
            <div className="space-y-0.5">
              <h1 className="text-sm font-display font-bold tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[11px] font-body text-muted-foreground leading-none">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <SentryButton variant="icon" size="icon" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-accent rounded-full border border-card" />
          </SentryButton>
          <ThemeToggle />
        </div>
        <div className="w-px h-6 bg-border mx-2" />
        <UserMenu />
      </div>
    </header>
  );
}

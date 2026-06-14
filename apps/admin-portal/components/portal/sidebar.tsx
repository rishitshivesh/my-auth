'use client';

import * as React from 'react';
import { NavItem } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";

import { LucideIcon } from 'lucide-react';

interface NavigationSection {
  label: string;
  items: {
    label: string;
    href: string;
    icon: LucideIcon;
  }[];
}

interface SidebarProps {
  navigation: NavigationSection[];
}

export function Sidebar({ navigation }: SidebarProps) {
  return (
    <aside className="w-[240px] flex flex-col bg-[var(--glass-3-bg)] backdrop-blur-[var(--glass-3-blur)] border-r border-border shadow-xl z-20">
      <div className="h-16 flex items-center px-6 gap-2 border-b border-border/50">
        <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[14px] font-display font-bold tracking-tight">
          Scrolloop <span className="text-accent">Sentry</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8">
        {navigation.map((section) => (
          <div key={section.label} className="space-y-2">
            <h3 className="px-3 text-[9px] font-display font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
              {section.label}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border/50">
        <div className="bg-black/5 rounded-sm p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-[10px] font-display font-bold text-accent">SS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-display font-semibold truncate">Enterprise Plan</p>
            <p className="text-[10px] font-body text-muted-foreground truncate">v2.4.0-stable</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

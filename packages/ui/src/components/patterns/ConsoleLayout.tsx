'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SentryButton } from '../sentry/SentryButton';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../ui/sheet';

export interface ConsoleLayoutProps {
  /** Brand/title block at the top of the sidebar. */
  brand: React.ReactNode;
  /** The navigation (NavItem list). Rendered in the sidebar and the mobile sheet. */
  nav: React.ReactNode;
  /** Header content to the right of the menu button (switcher, search, menus). */
  header: React.ReactNode;
  children: React.ReactNode;
  labels: { skipToContent: string; openNavigation: string; navigation: string };
  className?: string;
}

/**
 * Shared frame for tenant console, platform console and account shell.
 * Below `lg` the sidebar becomes a sheet; the skip link is the first tab stop.
 */
export function ConsoleLayout({ brand, nav, header, children, labels, className }: ConsoleLayoutProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <div className={cn('flex min-h-dvh w-full min-w-[320px] bg-background text-foreground', className)}>
      <a
        href="#console-main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-2 focus-visible:top-2 focus-visible:z-50 focus-visible:rounded-sm focus-visible:bg-card focus-visible:px-3 focus-visible:py-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {labels.skipToContent}
      </a>
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div>{brand}</div>
        <nav aria-label={labels.navigation} className="flex flex-1 flex-col gap-1 overflow-y-auto">{nav}</nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <SentryButton variant="icon" size="icon" className="lg:hidden" aria-label={labels.openNavigation}>
                <Menu aria-hidden="true" className="h-4 w-4" />
              </SentryButton>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-4 bg-sidebar p-4">
              <SheetTitle className="sr-only">{labels.navigation}</SheetTitle>
              <SheetDescription className="sr-only">{labels.navigation}</SheetDescription>
              <div>{brand}</div>
              <nav aria-label={labels.navigation} className="flex flex-col gap-1" onClick={() => setMobileOpen(false)}>
                {nav}
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">{header}</div>
        </header>
        <main id="console-main" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

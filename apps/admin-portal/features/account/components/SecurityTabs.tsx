"use client";

import Link from "next/link";
import { cn } from "@repo/ui/lib/utils";
import { accountRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";

export type SecurityTab = "methods" | "sessions" | "activity";

export interface SecurityTabsProps {
  current: SecurityTab;
}

/** Section switcher for personal security; real links so it works without scripting. */
export function SecurityTabs({ current }: SecurityTabsProps) {
  const { t } = useCopy();
  const tabs: ReadonlyArray<{ id: SecurityTab; href: string; label: string }> = [
    { id: "methods", href: accountRoutes.security(), label: t("account.security.tabs.methods") },
    { id: "sessions", href: accountRoutes.sessions(), label: t("account.security.tabs.sessions") },
    { id: "activity", href: accountRoutes.activity(), label: t("account.security.tabs.activity") },
  ];
  return (
    <nav aria-label={t("account.security.sectionsLabel")} className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-4">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              aria-current={tab.id === current ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-1 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab.id === current ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

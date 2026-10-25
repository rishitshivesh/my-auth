"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { platformNav } from "@/constants/navigation";
import { accountRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { ConsoleShell } from "./ConsoleShell";

const ENTRIES = platformNav();

export interface PlatformConsoleShellProps {
  identity: string;
  onSignOut: () => void;
  children: ReactNode;
}

export function PlatformConsoleShell({ identity, onSignOut, children }: PlatformConsoleShellProps) {
  const { t } = useCopy();
  const router = useRouter();
  return (
    <ConsoleShell
      entries={ENTRIES}
      titleKey="platform.shell.title"
      identity={identity}
      onSignOut={onSignOut}
      accountItems={[
        { id: "account", label: t("account.shell.manageAccount"), onSelect: () => router.push(accountRoutes.overview()) },
      ]}
      headerStart={
        <span className="rounded-xs border border-border bg-muted px-2 py-0.5 font-display text-[11px] font-semibold text-muted-foreground">
          {t("platform.shell.badge")}
        </span>
      }
    >
      {children}
    </ConsoleShell>
  );
}

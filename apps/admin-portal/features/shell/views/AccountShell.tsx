"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SentryButton } from "@repo/ui";
import { accountNav } from "@/constants/navigation";
import { useCopy } from "@/i18n";
import { ConsoleShell } from "./ConsoleShell";

const ENTRIES = accountNav();

export interface AccountShellProps {
  identity: string;
  onSignOut: () => void;
  /** Where "back to workspace" goes; omit when the user has no workspace context. */
  workspaceHref?: string;
  children: ReactNode;
}

export function AccountShell({ identity, onSignOut, workspaceHref, children }: AccountShellProps) {
  const { t } = useCopy();
  const router = useRouter();
  return (
    <ConsoleShell
      entries={ENTRIES}
      titleKey="account.shell.title"
      identity={identity}
      onSignOut={onSignOut}
      accountItems={[]}
      headerStart={
        workspaceHref ? (
          <SentryButton variant="ghost" size="sm" onClick={() => router.push(workspaceHref)}>
            {t("account.shell.backToWorkspace")}
          </SentryButton>
        ) : undefined
      }
    >
      {children}
    </ConsoleShell>
  );
}

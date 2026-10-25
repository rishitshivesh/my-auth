"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@repo/ui";
import { tenantNav } from "@/constants/navigation";
import { accountRoutes, tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { useUserWorkspaces } from "@/lib/queries";
import { ConsoleShell } from "./ConsoleShell";

export interface TenantConsoleShellProps {
  slug: string;
  identity: string;
  onSignOut: () => void;
  children: ReactNode;
}

export function TenantConsoleShell({ slug, identity, onSignOut, children }: TenantConsoleShellProps) {
  const { t } = useCopy();
  const router = useRouter();
  const workspaces = useUserWorkspaces();
  const entries = useMemo(() => tenantNav(slug), [slug]);
  const status = workspaces.isPending ? "loading" : workspaces.isError ? "error" : "ready";

  return (
    <ConsoleShell
      entries={entries}
      titleKey="tenant.shell.title"
      identity={identity}
      onSignOut={onSignOut}
      accountItems={[
        { id: "account", label: t("account.shell.manageAccount"), onSelect: () => router.push(accountRoutes.overview()) },
      ]}
      headerStart={
        <WorkspaceSwitcher
          workspaces={(workspaces.data ?? []).map((w) => ({ slug: w.slug, name: w.name }))}
          currentSlug={slug}
          status={status}
          onSelect={(next) => router.push(tenantRoutes(next).dashboard())}
          labels={{
            trigger: t("tenant.shell.switcher.label"),
            heading: t("tenant.shell.switcher.current"),
            none: t("tenant.shell.switcher.none"),
            loading: t("tenant.shell.switcher.loading"),
            error: t("tenant.shell.switcher.error"),
            note: t("tenant.shell.switcher.note"),
          }}
        />
      }
    >
      {children}
    </ConsoleShell>
  );
}

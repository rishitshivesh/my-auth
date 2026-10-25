"use client";

import Link from "next/link";
import { SentryButton, StateView } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import type { WorkspaceMembership } from "../api/use-workspace";

export interface WorkspaceChooserProps {
  workspaces: readonly WorkspaceMembership[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  onCreate: () => void;
}

export function WorkspaceChooser({ workspaces, status, onRetry, onCreate }: WorkspaceChooserProps) {
  const { t } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("workspace.chooser.loading")} />;
  if (status === "error") {
    return <StateView kind="error" title={t("workspace.chooser.error")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: onRetry }} />;
  }
  return (
    <div className="space-y-4">
      {workspaces.length === 0 ? (
        <StateView kind="empty" title={t("workspace.chooser.noneTitle")} description={t("workspace.chooser.noneDescription")} />
      ) : (
        <ul aria-label={t("workspace.chooser.listLabel")} className="divide-y divide-border rounded-md border border-border bg-card">
          {workspaces.map((w) => (
            <li key={w.tenantId}>
              <Link
                href={tenantRoutes(w.slug).dashboard()}
                className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block break-words font-display text-sm font-semibold text-foreground">{w.name}</span>
                  <span className="block break-all font-mono text-xs text-muted-foreground">{w.slug}</span>
                </span>
                <span className="font-body text-xs text-muted-foreground">
                  {w.isGuest ? t("workspace.chooser.guest") : t("workspace.chooser.member", { role: w.role })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SentryButton variant="outline" onClick={onCreate}>{t("workspace.chooser.create")}</SentryButton>
    </div>
  );
}

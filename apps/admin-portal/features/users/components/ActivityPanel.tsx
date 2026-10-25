"use client";

import { StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatRelative } from "../model/time";
import type { SecurityEventDto } from "../model/types";

export interface ActivityPanelProps {
  events: readonly SecurityEventDto[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
}

export function ActivityPanel({ events, status, onRetry }: ActivityPanelProps) {
  const { t } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("states.loading.title")} />;
  if (status === "error") {
    return <StateView kind="error" title={t("states.error.title")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: onRetry }} />;
  }
  if (events.length === 0) return <StateView kind="empty" title={t("users.activity.emptyTitle")} description={t("users.activity.emptyDescription")} />;
  return (
    <ol className="divide-y divide-border rounded-md border border-border bg-card">
      {events.map((e) => (
        <li key={e.id} className="p-3">
          <p className="break-all font-mono text-xs text-foreground">{e.eventType}</p>
          <p className="break-words font-body text-xs text-muted-foreground">
            {[t(`users.activity.severity.${severityKey(e.severity)}`), e.ipAddress, e.location, formatRelative(e.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </li>
      ))}
    </ol>
  );
}

function severityKey(severity: string): "info" | "warning" | "critical" {
  const s = severity.toLowerCase();
  if (s === "critical" || s === "high") return "critical";
  if (s === "warning" || s === "medium") return "warning";
  return "info";
}

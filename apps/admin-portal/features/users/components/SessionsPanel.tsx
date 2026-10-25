"use client";

import { SentryButton, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatRelative } from "../model/time";
import type { UserSessionDto } from "../model/types";

export interface SessionsPanelProps {
  sessions: readonly UserSessionDto[];
  status: "loading" | "error" | "ready";
  canWrite: boolean;
  onRevoke: (session: UserSessionDto) => void;
  onRevokeAll: () => void;
  onRetry: () => void;
}

export function sessionLabel(s: UserSessionDto, fallback: string): string {
  const info = s.deviceInfo ?? {};
  return [info.browser, info.os].filter(Boolean).join(" · ") || info.device || fallback;
}

export function SessionsPanel({ sessions, status, canWrite, onRevoke, onRevokeAll, onRetry }: SessionsPanelProps) {
  const { t } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("states.loading.title")} />;
  if (status === "error") {
    return <StateView kind="error" title={t("states.error.title")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: onRetry }} />;
  }
  if (sessions.length === 0) return <StateView kind="empty" title={t("users.sessions.emptyTitle")} description={t("users.sessions.emptyDescription")} />;
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <SentryButton variant="destructive" size="sm" onClick={onRevokeAll}>{t("users.sessions.revokeAll")}</SentryButton>
        </div>
      )}
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {sessions.map((s) => {
          const label = sessionLabel(s, t("users.sessions.unknownDevice"));
          const place = [s.location?.city, s.location?.country].filter(Boolean).join(", ");
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="break-words font-body text-sm text-foreground">{label}</p>
                <p className="break-all font-body text-xs text-muted-foreground">
                  {[place, s.ipAddress, formatRelative(s.lastActivity ?? s.lastActivityAt ?? s.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {canWrite && (
                <SentryButton variant="ghost" size="sm" aria-label={t("users.sessions.revokeFor", { name: label })} onClick={() => onRevoke(s)}>
                  {t("users.sessions.revoke")}
                </SentryButton>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

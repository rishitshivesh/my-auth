"use client";

import { DataTable, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { elapsedSince, formatRelative, type SessionRow } from "../model/sessions";

export interface SessionTableProps {
  rows: readonly SessionRow[];
  now: number;
  onRevoke: (row: SessionRow) => void;
}

function deviceName(row: SessionRow, unknown: string, line: (browser: string, os: string) => string): string {
  if (row.browser && row.os) return line(row.browser, row.os);
  return row.browser ?? row.os ?? row.device ?? unknown;
}

/** Device, place, activity and action; reflows to stacked cards on narrow screens. */
export function SessionTable({ rows, now, onRevoke }: SessionTableProps) {
  const { t } = useCopy();
  const unknown = t("account.sessions.unknownDevice");
  const name = (row: SessionRow) =>
    deviceName(row, unknown, (browser, os) => t("account.sessions.deviceLine", { browser, os }));
  return (
    <>
      <div className="hidden md:block">
        <DataTable
          emptyMessage={t("account.sessions.empty")}
          data={rows.map((r) => ({ ...r }))}
          columns={[
            { header: t("account.sessions.columns.device"), accessorKey: (row: SessionRow) => name(row) },
            { header: t("account.sessions.columns.location"), accessorKey: (row: SessionRow) => row.location ?? t("account.sessions.unknownLocation") },
            {
              header: t("account.sessions.columns.lastActive"),
              accessorKey: (row: SessionRow) =>
                formatRelative(elapsedSince(row.lastActivity, now), t("account.sessions.now"), t("account.sessions.unknownLocation")),
            },
            {
              header: t("account.sessions.columns.session"),
              accessorKey: (row: SessionRow) =>
                row.isCurrent ? (
                  <span className="font-medium text-success-text">{t("account.sessions.thisDevice")}</span>
                ) : (
                  <SentryButton
                    variant="outline"
                    size="sm"
                    aria-label={t("account.sessions.revokeLabel", { device: name(row) })}
                    onClick={() => onRevoke(row)}
                  >
                    {t("account.sessions.revoke")}
                  </SentryButton>
                ),
            },
          ]}
        />
      </div>
      <ul className="space-y-3 md:hidden" aria-label={t("account.sessions.title")}>
        {rows.map((row) => (
          <li key={row.id} className="space-y-1 rounded-sm border border-border p-3">
            <p className="font-body text-sm font-medium text-foreground">{name(row)}</p>
            <p className="font-body text-xs text-muted-foreground">
              {row.location ?? t("account.sessions.unknownLocation")}
              {" · "}
              {formatRelative(elapsedSince(row.lastActivity, now), t("account.sessions.now"), t("account.sessions.unknownLocation"))}
            </p>
            {row.isCurrent ? (
              <p className="font-body text-xs font-medium text-success-text">{t("account.sessions.thisDevice")}</p>
            ) : (
              <SentryButton variant="outline" size="sm" aria-label={t("account.sessions.revokeLabel", { device: name(row) })} onClick={() => onRevoke(row)}>
                {t("account.sessions.revoke")}
              </SentryButton>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

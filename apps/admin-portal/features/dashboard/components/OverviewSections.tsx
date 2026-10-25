"use client";

import Link from "next/link";
import { StateView } from "@repo/ui";
import { GlassCard } from "@repo/ui/components/sentry/GlassCard";
import { useCopy } from "@/i18n";
import { formatRelative } from "@/features/users/model/time";
import type { ActivityEvent } from "@/lib/types";
import type { SetupStep, Tile, TrendBar } from "../model/overview";

export type SectionStatus = "loading" | "error" | "ready";

function SectionState({ status, onRetry, children }: { status: SectionStatus; onRetry: () => void; children: React.ReactNode }) {
  const { t } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("states.loading.title")} />;
  if (status === "error") {
    return <StateView kind="error" title={t("dashboard.partialError")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: onRetry }} />;
  }
  return <>{children}</>;
}

export function StatTiles({ tiles, status, onRetry }: { tiles: readonly Tile[]; status: SectionStatus; onRetry: () => void }) {
  const { tk } = useCopy();
  return (
    <SectionState status={status} onRetry={onRetry}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <GlassCard key={tile.id} tier={1} className="p-4 sm:p-6">
            <dt className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tk(`dashboard.tiles.${tile.id}`)}</dt>
            <dd className="mt-2 break-words font-display text-2xl font-semibold text-foreground">{tile.value}</dd>
          </GlassCard>
        ))}
      </dl>
    </SectionState>
  );
}

export function TrendChart({ bars, status, onRetry }: { bars: readonly TrendBar[]; status: SectionStatus; onRetry: () => void }) {
  const { t } = useCopy();
  return (
    <section aria-labelledby="trend-title" className="space-y-3 rounded-md border border-border bg-card p-4 sm:p-6">
      <h2 id="trend-title" className="font-display text-base font-semibold text-foreground">{t("dashboard.trend.title")}</h2>
      <SectionState status={status} onRetry={onRetry}>
        {bars.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("dashboard.trend.empty")}</p>
        ) : (
          <ol className="flex h-40 items-end gap-2" aria-label={t("dashboard.trend.title")}>
            {bars.map((bar) => (
              <li key={bar.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center">
                <span className="font-body text-xs text-foreground">{bar.count}</span>
                <span className="block rounded-sm bg-accent" style={{ height: `${bar.percent}%` }} />
                <span className="truncate font-body text-xs text-muted-foreground">{bar.date.slice(5)}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionState>
    </section>
  );
}

export function ActivityList({ events, status, onRetry, auditHref }: { events: readonly ActivityEvent[]; status: SectionStatus; onRetry: () => void; auditHref: string }) {
  const { t } = useCopy();
  return (
    <section aria-labelledby="activity-title" className="space-y-3 rounded-md border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="activity-title" className="font-display text-base font-semibold text-foreground">{t("dashboard.activity.title")}</h2>
        <Link href={auditHref} className="font-display text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("dashboard.activity.viewAll")}</Link>
      </div>
      <SectionState status={status} onRetry={onRetry}>
        {events.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("dashboard.activity.empty")}</p>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <p className="break-all font-mono text-xs text-foreground">{e.eventType}</p>
                <p className="break-words font-body text-xs text-muted-foreground">{[e.actorEmail, formatRelative(e.createdAt)].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionState>
    </section>
  );
}

export function SetupGuide({ steps }: { steps: readonly SetupStep[] }) {
  const { t, tk } = useCopy();
  if (steps.every((s) => s.done)) return null;
  return (
    <section aria-labelledby="setup-title" className="space-y-3 rounded-md border border-border bg-card p-4 sm:p-6">
      <h2 id="setup-title" className="font-display text-base font-semibold text-foreground">{t("dashboard.setup.title")}</h2>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-body text-sm text-foreground">
              <span aria-hidden="true" className="mr-2">{s.done ? "✓" : "○"}</span>
              {tk(`dashboard.setup.steps.${s.id}`)}
              <span className="sr-only">{t(s.done ? "dashboard.setup.done" : "dashboard.setup.todo")}</span>
            </span>
            {!s.done && <Link href={s.href} className="font-display text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("dashboard.setup.go")}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import Link from "next/link";
import { GlassCard, PageHeader, StateView } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { platformRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { formatNumber } from "@/lib/format";
import { statusFromQuery } from "@/lib/resource-status";
import { usePlatformActivity, usePlatformMetrics } from "../api/admin";
import { ActivityList } from "../components/ActivityList";
import { platformStateLabels } from "../components/state-labels";

const ACTIVITY_PREVIEW = 10;

export function DashboardView() {
  const { t } = useCopy();
  const metrics = usePlatformMetrics();
  const activity = usePlatformActivity(ACTIVITY_PREVIEW);
  const status = statusFromQuery(metrics);
  const data = metrics.data;
  const tiles = data
    ? [
        { id: "tenants", label: t("platform.dashboard.metrics.tenants"), value: data.totalTenants },
        { id: "users", label: t("platform.dashboard.metrics.users"), value: data.totalUsers },
        { id: "sessions", label: t("platform.dashboard.metrics.sessions"), value: data.activeSessions },
        { id: "apiCalls", label: t("platform.dashboard.metrics.apiCalls"), value: data.apiCallsToday },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("platform.dashboard.title")} subtitle={t("platform.dashboard.subtitle")} />
      {status !== "ready" || !data ? (
        <PageState status={status === "ready" ? "loading" : status} labels={platformStateLabels(t)} onRetry={() => { void metrics.refetch(); }} />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <GlassCard key={tile.id} tier={1} className="space-y-1 p-5">
                <dt className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tile.label}</dt>
                <dd className="font-display text-2xl font-semibold text-foreground">{formatNumber(tile.value)}</dd>
              </GlassCard>
            ))}
          </dl>
          {data.totalTenants === 0 && (
            <GlassCard tier={1}>
              <StateView
                kind="empty"
                title={t("platform.dashboard.noTenants.title")}
                description={t("platform.dashboard.noTenants.body")}
              />
              <p className="pb-6 text-center">
                <Link href={platformRoutes.newTenant()} className="font-display text-sm font-semibold text-primary underline underline-offset-4">
                  {t("platform.dashboard.noTenants.action")}
                </Link>
              </p>
            </GlassCard>
          )}
        </>
      )}
      <GlassCard tier={1} className="space-y-3 p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-foreground">{t("platform.dashboard.activity.title")}</h2>
          <Link href={platformRoutes.audit()} className="font-display text-sm font-semibold text-primary underline underline-offset-4">
            {t("platform.dashboard.activity.all")}
          </Link>
        </header>
        {activity.isPending ? (
          <StateView kind="loading" title={t("states.loading.title")} />
        ) : activity.isError ? (
          <StateView kind="error" title={t("platform.common.errorTitle")} description={t("platform.common.errorBody")} action={{ label: t("platform.common.retry"), onClick: () => { void activity.refetch(); } }} />
        ) : (
          <ActivityList items={activity.data} empty={t("platform.dashboard.activity.empty")} />
        )}
      </GlassCard>
    </div>
  );
}

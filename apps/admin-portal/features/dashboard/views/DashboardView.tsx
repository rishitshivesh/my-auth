"use client";

import { useMemo } from "react";
import { PageHeader } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { useDashboard } from "../api/use-dashboard";
import { ActivityList, SetupGuide, StatTiles, TrendChart, type SectionStatus } from "../components/OverviewSections";
import { buildTiles, buildTrend, recentActivity, setupSteps } from "../model/overview";
import { ACTIVITY_LIMIT } from "../api/use-dashboard";

const statusOf = (q: { isPending: boolean; isError: boolean }): SectionStatus => (q.isPending ? "loading" : q.isError ? "error" : "ready");

export function DashboardView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { metrics, activity, trend } = useDashboard(slug);
  const routes = tenantRoutes(slug);
  const tiles = useMemo(() => (metrics.data ? buildTiles(metrics.data) : []), [metrics.data]);
  const steps = useMemo(() => (metrics.data ? setupSteps(metrics.data, routes) : []), [metrics.data, routes]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
      <StatTiles tiles={tiles} status={statusOf(metrics)} onRetry={() => void metrics.refetch()} />
      {metrics.data && <SetupGuide steps={steps} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart bars={buildTrend(trend.data ?? [])} status={statusOf(trend)} onRetry={() => void trend.refetch()} />
        <ActivityList events={recentActivity(activity.data ?? [], ACTIVITY_LIMIT)} status={statusOf(activity)} onRetry={() => void activity.refetch()} auditHref={routes.audit()} />
      </div>
    </div>
  );
}

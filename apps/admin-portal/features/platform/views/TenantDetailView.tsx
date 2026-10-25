"use client";

import Link from "next/link";
import { GlassCard, PageHeader, StateView } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { platformRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { statusFromQuery } from "@/lib/resource-status";
import { SentryApiError } from "@scrolloop/sdk";
import { useTenant } from "../api/admin";
import { ActivityList } from "../components/ActivityList";
import { TenantEditForm } from "../components/TenantEditForm";
import { TenantLifecycleActions } from "../components/TenantLifecycleActions";
import { TenantOverviewCard } from "../components/TenantOverviewCard";
import { platformStateLabels } from "../components/state-labels";

const NOT_FOUND = 404;

export function TenantDetailView({ tenantId }: { tenantId: string }) {
  const { t } = useCopy();
  const query = useTenant(tenantId);
  const status = statusFromQuery(query);
  const tenant = query.data;
  const missing = query.error instanceof SentryApiError && query.error.status === NOT_FOUND;

  const back = (
    <Link href={platformRoutes.tenants()} className="font-display text-sm font-semibold text-primary underline underline-offset-4">
      {t("platform.common.back")}
    </Link>
  );

  if (missing) {
    return (
      <div className="space-y-4">
        <StateView kind="not-found" title={t("platform.tenantDetail.notFoundTitle")} description={t("platform.tenantDetail.notFoundBody")} />
        <p className="text-center">{back}</p>
      </div>
    );
  }
  if (status !== "ready" || !tenant) {
    return <PageState status={status === "ready" ? "loading" : status} labels={platformStateLabels(t)} onRetry={() => { void query.refetch(); }} />;
  }
  return (
    <div className="space-y-6">
      <PageHeader title={tenant.name} subtitle={t("platform.tenantDetail.title")} action={back} className="mb-0 flex-wrap" />
      <TenantOverviewCard tenant={tenant} />
      <TenantEditForm key={`${tenant.name}-${tenant.plan}`} tenant={tenant} />
      <GlassCard tier={1} className="space-y-3 p-6">
        <h2 className="font-display text-base font-semibold text-foreground">{t("platform.tenantDetail.recent.title")}</h2>
        <ActivityList items={tenant.recentActivity} empty={t("platform.tenantDetail.recent.empty")} />
      </GlassCard>
      <TenantLifecycleActions tenant={tenant} />
    </div>
  );
}

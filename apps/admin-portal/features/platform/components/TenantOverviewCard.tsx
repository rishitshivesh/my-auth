"use client";

import { GlassCard, StatusBadge } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import type { TenantDetail } from "../model/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="font-body text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function TenantOverviewCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useCopy();
  const active = tenant.status === "active";
  const flags = Object.entries(tenant.featureFlags ?? {});
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <h2 className="font-display text-base font-semibold text-foreground">{t("platform.tenantDetail.overview.title")}</h2>
      <dl className="space-y-3">
        <Row label={t("platform.tenantDetail.overview.slug")}><span className="font-mono">{tenant.slug}</span></Row>
        <Row label={t("platform.tenantDetail.overview.plan")}>{tenant.plan}</Row>
        <Row label={t("platform.tenantDetail.overview.environment")}>{tenant.environment}</Row>
        <Row label={t("platform.tenantDetail.overview.status")}>
          <StatusBadge status={active ? "active" : "suspended"}>
            {active ? t("platform.tenants.statusValue.active") : t("platform.tenants.statusValue.suspended")}
          </StatusBadge>
        </Row>
        <Row label={t("platform.tenantDetail.overview.people")}>{formatNumber(tenant.userCount)}</Row>
        <Row label={t("platform.tenantDetail.overview.sessions")}>{formatNumber(tenant.activeSessions)}</Row>
        <Row label={t("platform.tenantDetail.overview.created")}>{formatDate(tenant.createdAt)}</Row>
        <Row label={t("platform.tenantDetail.overview.domain")}>
          {tenant.customDomain ? <span className="font-mono">{tenant.customDomain}</span> : t("platform.tenantDetail.overview.noDomain")}
        </Row>
        <Row label={t("platform.tenantDetail.overview.flags")}>
          {flags.length === 0 ? t("platform.tenantDetail.overview.noFlags") : (
            <ul className="flex flex-wrap gap-2">
              {flags.map(([key, on]) => (
                <li key={key} className="rounded-xs border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                  {key}: {on ? t("tenantAdmin.common.yes") : t("tenantAdmin.common.no")}
                </li>
              ))}
            </ul>
          )}
        </Row>
      </dl>
    </GlassCard>
  );
}

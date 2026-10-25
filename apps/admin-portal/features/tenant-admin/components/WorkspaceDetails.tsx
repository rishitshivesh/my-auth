"use client";

import { GlassCard, StatusBadge } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { TenantContext } from "../model/settings";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="font-body text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function WorkspaceDetails({ tenant }: { tenant: TenantContext }) {
  const { t } = useCopy();
  const active = tenant.active !== false;
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.settings.context.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.settings.context.description")}</p>
      </header>
      <dl className="space-y-3">
        <Row label={t("tenantAdmin.settings.context.name")}>{tenant.name}</Row>
        <Row label={t("tenantAdmin.settings.context.slug")}><span className="font-mono">{tenant.slug}</span></Row>
        {tenant.environment && <Row label={t("tenantAdmin.settings.context.environment")}>{tenant.environment}</Row>}
        <Row label={t("tenantAdmin.settings.context.status")}>
          <StatusBadge status={active ? "active" : "suspended"}>
            {active ? t("tenantAdmin.settings.context.active") : t("tenantAdmin.settings.context.suspended")}
          </StatusBadge>
        </Row>
      </dl>
      <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.settings.context.readOnly")}</p>
    </GlassCard>
  );
}

"use client";

import { GlassCard, PageHeader, StatusBadge } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { ProposedCapabilityView } from "@/features/capabilities/views/ProposedCapabilityView";
import { useCopy } from "@/i18n";
import { statusFromQuery } from "@/lib/resource-status";
import { useTenantContext } from "../api/settings";
import { tenantStateLabels } from "../components/state-labels";
import { domainState } from "../model/settings";

/** Read-only domain status; configuring and verifying are operator-only today (TODO(gap:T22)). */
export function DomainsView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const query = useTenantContext(slug);
  const status = statusFromQuery(query);
  const state = query.data ? domainState(query.data) : "none";
  return (
    <div className="space-y-6">
      <PageHeader title={t("tenantAdmin.domains.title")} subtitle={t("tenantAdmin.domains.subtitle")} />
      {status !== "ready" || !query.data ? (
        <PageState status={status === "ready" ? "loading" : status} labels={tenantStateLabels(t)} onRetry={() => { void query.refetch(); }} />
      ) : (
        <GlassCard tier={1} className="space-y-4 p-6">
          <header className="space-y-1">
            <h2 className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.domains.custom.title")}</h2>
            <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.domains.custom.description")}</p>
          </header>
          {state === "none" ? (
            <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.domains.custom.none")}</p>
          ) : (
            <div className="space-y-2">
              <p className="font-body text-sm text-foreground">
                {t("tenantAdmin.domains.custom.domain")}: <span className="font-mono">{query.data.customDomain}</span>
              </p>
              <StatusBadge status={state === "verified" ? "active" : "pending"}>
                {state === "verified" ? t("tenantAdmin.domains.custom.verified") : t("tenantAdmin.domains.custom.pending")}
              </StatusBadge>
              {state === "verified" && <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.domains.custom.verifiedNote")}</p>}
            </div>
          )}
          <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.domains.custom.operatorOnly")}</p>
        </GlassCard>
      )}
      <section aria-labelledby="domains-email" className="space-y-3">
        <h2 id="domains-email" className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.domains.email.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.domains.email.description")}</p>
        <ProposedCapabilityView id="domains" />
      </section>
    </div>
  );
}

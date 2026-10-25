"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { usePermission } from "@/hooks/use-permission";
import { resourceStatus } from "@/features/applications/model/resource-status";
import { useCopy } from "@/i18n";
import { useSocialSettings } from "../api/connections";
import { SocialProviderDialog } from "../components/SocialProviderDialog";
import { SocialProvidersList } from "../components/SocialProvidersList";
import { socialRows, type SocialRow } from "../model/social";
import { PageFrame } from "@/components/page/PageFrame";

export function ConnectionsOverviewView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const query = useSocialSettings(slug);
  const [editing, setEditing] = useState<SocialRow | null>(null);
  const rows = useMemo(() => socialRows(query.data?.socialProviders ?? []), [query.data]);
  const routes = tenantRoutes(slug);
  const enterprise = [
    { id: "saml", href: routes.saml(), copy: "saml" },
    { id: "scim", href: routes.scim(), copy: "scim" },
    { id: "ldap", href: routes.ldap(), copy: "ldap" },
  ] as const;

  return (
    <PageFrame title={t("tenantIntegrations.connections.title")} subtitle={t("tenantIntegrations.connections.subtitle")}>
      <section aria-labelledby="social-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="social-heading" className="font-display text-lg font-semibold">{t("tenantIntegrations.connections.socialHeading")}</h2>
          <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.connections.socialDescription")}</p>
        </div>
        <SocialProvidersList
          rows={rows}
          status={resourceStatus(query)}
          canWrite={!isReady || can("tenant:write")}
          onRetry={() => void query.refetch()}
          onConfigure={setEditing}
        />
      </section>
      <section aria-labelledby="enterprise-heading" className="space-y-3">
        <h2 id="enterprise-heading" className="font-display text-lg font-semibold">{t("tenantIntegrations.connections.enterpriseHeading")}</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {enterprise.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GlassCard tier={1} className="h-full space-y-1 p-5">
                  <h3 className="font-display text-base font-semibold">{t(`tenantIntegrations.connections.${item.copy}.title`)}</h3>
                  <p className="font-body text-sm text-muted-foreground">{t(`tenantIntegrations.connections.${item.copy}.description`)}</p>
                  <span className="font-display text-sm font-medium text-accent">{t(`tenantIntegrations.connections.${item.copy}.open`)}</span>
                </GlassCard>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <SocialProviderDialog slug={slug} row={editing} onClose={() => setEditing(null)} />
    </PageFrame>
  );
}

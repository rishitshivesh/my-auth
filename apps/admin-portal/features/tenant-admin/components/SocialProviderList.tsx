"use client";

import { GlassCard, StatusBadge } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { SocialProviderStatus } from "../model/settings";

export function SocialProviderList({ providers }: { providers: readonly SocialProviderStatus[] }) {
  const { t } = useCopy();
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.settings.providers.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.settings.providers.description")}</p>
      </header>
      {providers.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.settings.providers.none")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {providers.map((p) => (
            <li key={p.provider} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-display text-sm font-medium capitalize text-foreground">{p.provider}</span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.enabled ? "active" : "system"}>
                  {p.enabled ? t("tenantAdmin.settings.providers.enabled") : t("tenantAdmin.settings.providers.disabled")}
                </StatusBadge>
                <span className="font-body text-xs text-muted-foreground">
                  {p.hasClientSecret ? t("tenantAdmin.settings.providers.secretSet") : t("tenantAdmin.settings.providers.secretMissing")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.settings.providers.gap")}</p>
    </GlassCard>
  );
}

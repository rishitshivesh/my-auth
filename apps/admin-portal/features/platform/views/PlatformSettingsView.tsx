"use client";

import { GlassCard, PageHeader, StatusBadge } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { useCopy } from "@/i18n";
import { statusFromQuery } from "@/lib/resource-status";
import { usePlatformSettings } from "../api/admin";
import { MaintenanceSection } from "../components/MaintenanceSection";
import { PlatformSettingsForm } from "../components/PlatformSettingsForm";
import { TeamSection } from "../components/TeamSection";
import { platformStateLabels } from "../components/state-labels";

export function PlatformSettingsView() {
  const { t } = useCopy();
  const query = usePlatformSettings();
  const status = statusFromQuery(query);
  const settings = query.data;
  return (
    <div className="space-y-6">
      <PageHeader title={t("platform.settings.title")} subtitle={t("platform.settings.subtitle")} className="mb-0" />
      {status !== "ready" || !settings ? (
        <PageState status={status === "ready" ? "loading" : status} labels={platformStateLabels(t)} onRetry={() => { void query.refetch(); }} />
      ) : (
        <>
          {/* Keyed on saved values so a refetch after save resets the draft. */}
          <PlatformSettingsForm key={JSON.stringify(settings)} settings={settings} />
          <GlassCard tier={1} className="space-y-3 p-6">
            <header className="space-y-1">
              <h2 className="font-display text-base font-semibold text-foreground">{t("platform.settings.smtp.title")}</h2>
              <p className="font-body text-sm text-muted-foreground">{t("platform.settings.smtp.description")}</p>
            </header>
            <StatusBadge status={settings.smtpConfigured ? "active" : "pending"}>
              {settings.smtpConfigured ? t("platform.settings.smtp.configured") : t("platform.settings.smtp.notConfigured")}
            </StatusBadge>
            {settings.smtpHost && (
              <p className="font-body text-sm text-foreground">
                {t("platform.settings.smtp.host")}: <span className="font-mono">{settings.smtpHost}</span>
              </p>
            )}
            <p className="font-body text-xs text-muted-foreground">{t("platform.settings.smtp.gap")}</p>
          </GlassCard>
        </>
      )}
      <TeamSection />
      <MaintenanceSection />
    </div>
  );
}

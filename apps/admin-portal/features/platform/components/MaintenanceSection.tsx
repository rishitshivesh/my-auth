"use client";

import { useState } from "react";
import { ConfirmDialog, GlassCard, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { errorText } from "@/lib/resource-status";
import { useTokenCleanup } from "../api/admin";

export function MaintenanceSection() {
  const { t } = useCopy();
  const cleanup = useTokenCleanup();
  const [open, setOpen] = useState(false);
  const result = cleanup.data;
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("platform.settings.maintenance.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("platform.settings.maintenance.description")}</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{t("platform.settings.maintenance.cleanup.title")}</h3>
          <p className="font-body text-sm text-muted-foreground">{t("platform.settings.maintenance.cleanup.body")}</p>
        </div>
        <SentryButton variant="outline" onClick={() => setOpen(true)}>{t("platform.settings.maintenance.cleanup.action")}</SentryButton>
      </div>
      <p role="status" className="font-body text-sm text-success-text">
        {result ? t("platform.settings.maintenance.cleanup.result", { deleted: result.deleted, ms: result.durationMs }) : ""}
      </p>
      <p className="font-body text-xs text-muted-foreground">{t("platform.settings.maintenance.statsGap")}</p>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => { setOpen(next); if (!next) cleanup.reset(); }}
        title={t("platform.settings.maintenance.cleanup.confirmTitle")}
        description={t("platform.settings.maintenance.cleanup.confirmBody")}
        effects={[t("platform.settings.maintenance.cleanup.effects.one"), t("platform.settings.maintenance.cleanup.effects.two")]}
        effectsHeading={t("platform.tenantDetail.dialog.effects")}
        confirmLabel={t("platform.settings.maintenance.cleanup.confirm")}
        cancelLabel={t("platform.tenantDetail.dialog.cancel")}
        pending={cleanup.isPending}
        error={cleanup.isError ? `${t("platform.settings.maintenance.cleanup.failed")} ${errorText(cleanup.error) ?? ""}` : undefined}
        onConfirm={async () => { await cleanup.mutateAsync().then(() => setOpen(false)).catch(() => undefined); }}
      />
    </GlassCard>
  );
}

"use client";

import { useState } from "react";
import { ConfirmDialog, GlassCard, SentryButton } from "@repo/ui";
import { useRouter } from "next/navigation";
import { platformRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { errorText } from "@/lib/resource-status";
import { useDeleteTenant, useUpdateTenant } from "../api/admin";
import { deleteConfirmPhrase, nextStatus } from "../model/tenants";
import type { TenantDetail } from "../model/types";

type Open = "status" | "delete" | null;

export function TenantLifecycleActions({ tenant }: { tenant: TenantDetail }) {
  const { t } = useCopy();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const update = useUpdateTenant(tenant.id);
  const remove = useDeleteTenant(tenant.id);
  const suspending = nextStatus(tenant.status) === "suspended";
  const key = suspending ? "suspend" : "restore";
  const close = (next: boolean) => { if (!next) { setOpen(null); update.reset(); remove.reset(); } };
  const phrase = deleteConfirmPhrase(tenant);

  return (
    <div className="space-y-4">
      <GlassCard tier={1} className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">{t(`platform.tenantDetail.${key}.action`)}</h2>
          <p className="font-body text-sm text-muted-foreground">{t(`platform.tenantDetail.${key}.description`)}</p>
        </div>
        <SentryButton variant={suspending ? "outline" : "primary"} onClick={() => setOpen("status")}>
          {t(`platform.tenantDetail.${key}.action`)}
        </SentryButton>
      </GlassCard>
      <GlassCard tier={1} className="space-y-3 border-destructive p-6">
        <h2 className="font-display text-base font-semibold text-destructive">{t("platform.tenantDetail.delete.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("platform.tenantDetail.delete.description")}</p>
        <p className="font-body text-xs text-muted-foreground">{t("platform.tenantDetail.delete.gap")}</p>
        <SentryButton variant="destructive" onClick={() => setOpen("delete")}>{t("platform.tenantDetail.delete.action")}</SentryButton>
      </GlassCard>
      <ConfirmDialog
        open={open === "status"}
        onOpenChange={close}
        title={t(`platform.tenantDetail.${key}.title`, { name: tenant.name })}
        description={t(`platform.tenantDetail.${key}.description`)}
        effects={[t(`platform.tenantDetail.${key}.effects.one`), t(`platform.tenantDetail.${key}.effects.two`), t(`platform.tenantDetail.${key}.effects.three`)]}
        effectsHeading={t("platform.tenantDetail.dialog.effects")}
        confirmLabel={t(`platform.tenantDetail.${key}.confirm`)}
        cancelLabel={t("platform.tenantDetail.dialog.cancel")}
        destructive={suspending}
        pending={update.isPending}
        error={errorText(update.error)}
        onConfirm={async () => { await update.mutateAsync({ status: nextStatus(tenant.status) }).then(() => setOpen(null)).catch(() => undefined); }}
      />
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={close}
        title={t("platform.tenantDetail.delete.dialogTitle", { name: tenant.name })}
        description={t("platform.tenantDetail.delete.dialogBody")}
        effects={[t("platform.tenantDetail.delete.effects.one"), t("platform.tenantDetail.delete.effects.two"), t("platform.tenantDetail.delete.effects.three")]}
        effectsHeading={t("platform.tenantDetail.dialog.effects")}
        confirmLabel={t("platform.tenantDetail.delete.confirm")}
        cancelLabel={t("platform.tenantDetail.dialog.cancel")}
        confirmPhrase={phrase}
        confirmPhraseLabel={t("platform.tenantDetail.delete.phraseLabel", { phrase })}
        destructive
        pending={remove.isPending}
        error={errorText(remove.error)}
        onConfirm={async () => { await remove.mutateAsync().then(() => router.push(platformRoutes.tenants())).catch(() => undefined); }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { PageHeader, SettingsSection } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { usePermission } from "@/hooks/use-permission";
import { useCopy } from "@/i18n";
import { errorText, statusFromQuery } from "@/lib/resource-status";
import { useBranding, useSaveBranding, useUploadLogo } from "../api/branding";
import { BrandingAppearanceFields } from "../components/BrandingAppearanceFields";
import { BrandingPreview } from "../components/BrandingPreview";
import { LogoUpload } from "../components/LogoUpload";
import { tenantStateLabels } from "../components/state-labels";
import { isDirty, isValidHex, type Branding } from "../model/branding";

export function BrandingView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const query = useBranding(slug);
  const save = useSaveBranding(slug);
  const upload = useUploadLogo(slug);
  const [draft, setDraft] = useState<Branding | null>(null);

  const status = statusFromQuery(query);
  const saved = query.data;
  const current = draft && saved ? { ...draft, logoUrl: saved.logoUrl } : saved;
  const dirty = Boolean(saved && current && isDirty(saved, current));
  const readOnly = isReady && !can("tenant:write");

  return (
    <div className="space-y-6">
      <PageHeader title={t("tenantAdmin.branding.title")} subtitle={t("tenantAdmin.branding.subtitle")} />
      {status !== "ready" || !current ? (
        <PageState status={status === "ready" ? "loading" : status} labels={tenantStateLabels(t)} onRetry={() => { void query.refetch(); }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <SettingsSection
              title={t("tenantAdmin.branding.appearance.title")}
              description={t("tenantAdmin.branding.appearance.description")}
              dirty={dirty}
              invalid={!isValidHex(current.primaryColor)}
              pending={save.isPending}
              error={errorText(save.error)}
              savedMessage={save.isSuccess ? t("tenantAdmin.branding.appearance.saved") : undefined}
              readOnly={readOnly}
              onSave={() => save.mutate(current, { onSuccess: () => setDraft(null) })}
              onDiscard={() => { setDraft(null); save.reset(); }}
              saveLabel={t("tenantAdmin.branding.appearance.save")}
              discardLabel={t("tenantAdmin.branding.appearance.reset")}
            >
              <BrandingAppearanceFields draft={current} disabled={readOnly || save.isPending} onChange={setDraft} />
              {readOnly && <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.common.readOnlyNote")}</p>}
            </SettingsSection>
            <LogoUpload
              logoUrl={saved?.logoUrl}
              disabled={readOnly}
              pending={upload.isPending}
              uploaded={upload.isSuccess}
              serverError={upload.error}
              onUpload={(file) => upload.mutate(file)}
            />
          </div>
          <BrandingPreview draft={current} />
        </div>
      )}
    </div>
  );
}

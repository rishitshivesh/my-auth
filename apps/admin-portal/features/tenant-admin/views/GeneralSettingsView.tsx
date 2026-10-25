"use client";

import { useState } from "react";
import { PageHeader, SettingsSection } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { ToggleRow } from "@/components/page/ToggleRow";
import { ProposedCapabilityView } from "@/features/capabilities/views/ProposedCapabilityView";
import { usePermission } from "@/hooks/use-permission";
import { useCopy } from "@/i18n";
import { errorText, statusFromQuery } from "@/lib/resource-status";
import { useTenantContext, useTenantSettings, useUpdateFlags } from "../api/settings";
import { SocialProviderList } from "../components/SocialProviderList";
import { WorkspaceDetails } from "../components/WorkspaceDetails";
import { tenantStateLabels } from "../components/state-labels";
import { EDITABLE_FLAGS, changedFlags, flagDraft, readOnlyFlags, type FlagDraft } from "../model/settings";

export function GeneralSettingsView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const context = useTenantContext(slug);
  const settings = useTenantSettings(slug);
  const update = useUpdateFlags(slug);
  const [draft, setDraft] = useState<FlagDraft | null>(null);

  const status = statusFromQuery(settings);
  const saved = settings.data ? flagDraft(settings.data.featureFlags) : null;
  const current = draft ?? saved;
  const changes = saved && current ? changedFlags(saved, current) : {};
  const dirty = Object.keys(changes).length > 0;
  const readOnly = isReady && !can("tenant:write");
  const extra = settings.data ? readOnlyFlags(settings.data.featureFlags) : [];

  const save = () =>
    update.mutate(changes as Record<string, boolean>, { onSuccess: () => setDraft(null) });

  return (
    <div className="space-y-6">
      <PageHeader title={t("tenantAdmin.settings.title")} subtitle={t("tenantAdmin.settings.subtitle")} />
      {context.data && <WorkspaceDetails tenant={context.data} />}
      {status !== "ready" || !current ? (
        <PageState status={status === "ready" ? "loading" : status} labels={tenantStateLabels(t)} onRetry={() => { void settings.refetch(); }} />
      ) : (
        <>
          <SettingsSection
            title={t("tenantAdmin.settings.methods.title")}
            description={t("tenantAdmin.settings.methods.description")}
            dirty={dirty}
            pending={update.isPending}
            error={errorText(update.error)}
            savedMessage={update.isSuccess ? t("tenantAdmin.settings.methods.saved") : undefined}
            readOnly={readOnly}
            onSave={save}
            onDiscard={() => { setDraft(null); update.reset(); }}
            saveLabel={t("tenantAdmin.settings.methods.save")}
            discardLabel={t("tenantAdmin.settings.methods.discard")}
          >
            {EDITABLE_FLAGS.map((flag) => (
              <ToggleRow
                key={flag}
                label={t(`tenantAdmin.settings.methods.${flag}`)}
                hint={t(`tenantAdmin.settings.methods.${flag}Hint`)}
                checked={current[flag]}
                disabled={readOnly || update.isPending}
                onChange={(checked) => setDraft({ ...current, [flag]: checked })}
              />
            ))}
            {readOnly && <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.common.readOnlyNote")}</p>}
            {extra.length > 0 && (
              <p className="font-body text-xs text-muted-foreground">
                {t("tenantAdmin.settings.methods.otherFlags")}: <span className="font-mono">{extra.join(", ")}</span>
              </p>
            )}
          </SettingsSection>
          <SocialProviderList providers={settings.data?.socialProviders ?? []} />
        </>
      )}
      <section aria-labelledby="settings-danger" className="space-y-3">
        <h2 id="settings-danger" className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.settings.danger.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.settings.danger.description")}</p>
        <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.settings.danger.platformNote")}</p>
        <ProposedCapabilityView id="ownership" />
      </section>
    </div>
  );
}

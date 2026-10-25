"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormField, GlassCard, Label, SentryButton, SentryInput, Switch, Textarea } from "@repo/ui";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useUpdateClient } from "../api/clients";
import {
  toEditDraft, toUpdateBody, validateEditDraft, type EditClientDraft,
} from "../model/client-form";
import type { OAuthClient } from "../model/types";
import { editFieldMessages } from "./client-form-errors";

export interface ClientSettingsFormProps {
  slug: string;
  client: OAuthClient;
  canWrite: boolean;
}

export function ClientSettingsForm({ slug, client, canWrite }: ClientSettingsFormProps) {
  const { t } = useCopy();
  const update = useUpdateClient(slug, client.clientId);
  const [draft, setDraft] = useState<EditClientDraft>(() => toEditDraft(client));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => setDraft(toEditDraft(client)), [client]);

  const baseline = useMemo(() => toEditDraft(client), [client]);
  const dirty = useUnsavedChanges(baseline, draft);
  const messages = useMemo(() => editFieldMessages(submitted ? validateEditDraft(draft) : []), [draft, submitted]);
  const patch = (next: Partial<EditClientDraft>) => setDraft({ ...draft, ...next });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (validateEditDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      await update.mutateAsync(toUpdateBody(client, draft));
      setSubmitted(false);
      toast.success(t("tenantIntegrations.common.saved"));
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  return (
    <GlassCard tier={1} className="p-6">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-labelledby="client-general-heading">
        <div className="space-y-1">
          <h2 id="client-general-heading" className="font-display text-base font-semibold">{t("tenantIntegrations.apps.detail.general")}</h2>
          <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.apps.detail.generalDescription")}</p>
        </div>
        <fieldset disabled={!canWrite} className="space-y-4">
          <FormField label={t("tenantIntegrations.apps.create.name")} required error={messages.name}>
            {(control) => <SentryInput {...control} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />}
          </FormField>
          <FormField label={t("tenantIntegrations.apps.create.description2")} optionalLabel={t("common.labels.optional")}>
            {(control) => <SentryInput {...control} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />}
          </FormField>
          <FormField label={t("tenantIntegrations.apps.detail.logoUrl")} optionalLabel={t("common.labels.optional")} error={messages.logoUrl}>
            {(control) => <SentryInput {...control} type="url" value={draft.logoUrl} onChange={(e) => patch({ logoUrl: e.target.value })} />}
          </FormField>
          <FormField label={t("tenantIntegrations.apps.create.redirects")} hint={t("tenantIntegrations.apps.create.redirectsHint")} error={messages.redirectUris}>
            {(control) => (
              <Textarea {...control} rows={4} spellCheck={false} className="font-mono text-sm" value={draft.redirectUris} onChange={(e) => patch({ redirectUris: e.target.value })} />
            )}
          </FormField>
          <div className="flex items-start gap-3">
            <Switch id="client-active" checked={draft.isActive} onCheckedChange={(isActive) => patch({ isActive })} />
            <Label htmlFor="client-active" className="flex flex-col items-start gap-0.5">
              <span>{t("tenantIntegrations.apps.detail.activeLabel")}</span>
              <span className="font-body text-xs font-normal text-muted-foreground">{t("tenantIntegrations.apps.detail.activeHint")}</span>
            </Label>
          </div>
          <div className="space-y-1">
            <p className="font-display text-[13px] font-medium">{t("tenantIntegrations.apps.detail.grantsReadonly")}</p>
            <p className="font-mono text-xs text-foreground">{client.grantTypes.join(" , ")}</p>
            <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.detail.grantsReadonlyHint")}</p>
          </div>
        </fieldset>
        {/* TODO(gap:T11-edit-contract): PUT /oauth/clients/:clientId accepts only name, description, redirectUris, logoUrl, isActive and allowedScopes; origins, post-logout URIs and lifetimes cannot be edited. */}
        <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.detail.allowedOriginsGap")}</p>
        {serverError && <p role="alert" className="font-body text-sm text-destructive">{serverError}</p>}
        {canWrite && (
          <div className="flex items-center gap-3">
            <SentryButton type="submit" variant="primary" isLoading={update.isPending} disabled={!dirty}>
              {t("tenantIntegrations.apps.detail.save")}
            </SentryButton>
            {dirty && <span role="status" className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.detail.unsaved")}</span>}
          </div>
        )}
      </form>
    </GlassCard>
  );
}

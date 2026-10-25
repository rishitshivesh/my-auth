"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField, Label, SentryInput, Switch } from "@repo/ui";
import { FormDialog } from "@/features/applications/components/FormDialog";
import { CopyableValue } from "@/features/applications/components/CopyableValue";
import { apiBaseUrl } from "@/features/applications/api/request";
import { socialCallbackUrl } from "@/features/applications/model/endpoints";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useUpdateSocialProvider } from "../api/connections";
import { toSocialBody, toSocialDraft, validateSocialDraft, type SocialDraft, type SocialRow } from "../model/social";

export interface SocialProviderDialogProps {
  slug: string;
  row: SocialRow | null;
  onClose: () => void;
}

export function SocialProviderDialog({ slug, row, onClose }: SocialProviderDialogProps) {
  const { t, tk } = useCopy();
  const update = useUpdateSocialProvider(slug, row?.provider ?? "");
  const [draft, setDraft] = useState<SocialDraft>({ enabled: false, clientId: "", clientSecret: "" });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (row) setDraft(toSocialDraft(row));
    setSubmitted(false);
    setServerError(undefined);
  }, [row]);

  if (!row) return null;
  const provider = tk(`tenantIntegrations.connections.provider.${row.provider}`);
  const errors = submitted ? validateSocialDraft(draft, row) : [];

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateSocialDraft(draft, row).length > 0) return;
    setServerError(undefined);
    try {
      await update.mutateAsync(toSocialBody(draft));
      toast.success(t("tenantIntegrations.connections.form.saved"));
      onClose();
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t("tenantIntegrations.connections.form.title", { provider })}
      description={t("tenantIntegrations.connections.form.description", { provider })}
      submitLabel={t("tenantIntegrations.connections.form.submit")}
      onSubmit={onSubmit}
      pending={update.isPending}
      error={serverError}
    >
      <CopyableValue
        label={t("tenantIntegrations.endpoints.socialCallback", { provider })}
        value={socialCallbackUrl(apiBaseUrl(), row.provider)}
      />
      <div className="flex items-center gap-3">
        <Switch id="social-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
        <Label htmlFor="social-enabled">{t("tenantIntegrations.connections.form.enabled", { provider })}</Label>
      </div>
      <FormField
        label={t("tenantIntegrations.connections.form.clientId")}
        error={errors.includes("clientId") ? t("tenantIntegrations.connections.form.clientIdRequired") : undefined}
      >
        {(control) => (
          <SentryInput {...control} value={draft.clientId} autoComplete="off" onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} />
        )}
      </FormField>
      <FormField
        label={t("tenantIntegrations.connections.form.clientSecret")}
        hint={row.hasClientSecret ? t("tenantIntegrations.connections.form.secretKeep") : t("tenantIntegrations.connections.form.secretNew")}
        error={errors.includes("clientSecret") ? t("tenantIntegrations.connections.form.secretRequired") : undefined}
      >
        {(control) => (
          <SentryInput
            {...control}
            type="password"
            autoComplete="new-password"
            value={draft.clientSecret}
            onChange={(e) => setDraft({ ...draft, clientSecret: e.target.value })}
          />
        )}
      </FormField>
      <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.connections.form.noReadback")}</p>
    </FormDialog>
  );
}

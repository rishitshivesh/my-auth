"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField, SentryInput, Textarea } from "@repo/ui";
import { FormDialog } from "@/features/applications/components/FormDialog";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useSamlMutations } from "../api/connections";
import { EMPTY_SAML_DRAFT, toSamlBody, validateSamlDraft, type SamlDraft } from "../model/saml";

export interface RegisterSamlDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegisterSamlDialog({ slug, open, onOpenChange }: RegisterSamlDialogProps) {
  const { t } = useCopy();
  const { register } = useSamlMutations(slug);
  const [draft, setDraft] = useState<SamlDraft>(EMPTY_SAML_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_SAML_DRAFT);
      setSubmitted(false);
      setServerError(undefined);
    }
  }, [open]);

  const errors = submitted ? validateSamlDraft(draft) : [];
  const message = (field: (typeof errors)[number], key: "requiredField" | "invalidUrl") =>
    errors.includes(field) ? t(`tenantIntegrations.common.${key}`) : undefined;
  const patch = (next: Partial<SamlDraft>) => setDraft({ ...draft, ...next });

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateSamlDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      await register.mutateAsync(toSamlBody(draft));
      toast.success(t("tenantIntegrations.saml.form.saved"));
      onOpenChange(false);
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  const f = "tenantIntegrations.saml.form" as const;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`${f}.title`)}
      description={t(`${f}.description`)}
      submitLabel={t(`${f}.submit`)}
      onSubmit={onSubmit}
      pending={register.isPending}
      error={serverError}
    >
      <FormField label={t(`${f}.name`)} required error={message("name", "requiredField")}>
        {(c) => <SentryInput {...c} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.entityId`)} required error={message("entityId", "requiredField")}>
        {(c) => <SentryInput {...c} value={draft.entityId} spellCheck={false} onChange={(e) => patch({ entityId: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.acsUrl`)} required error={message("acsUrl", "invalidUrl")}>
        {(c) => <SentryInput {...c} type="url" value={draft.acsUrl} onChange={(e) => patch({ acsUrl: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.sloUrl`)} optionalLabel={t("common.labels.optional")} error={message("sloUrl", "invalidUrl")}>
        {(c) => <SentryInput {...c} type="url" value={draft.sloUrl} onChange={(e) => patch({ sloUrl: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.metadataUrl`)} optionalLabel={t("common.labels.optional")} error={message("metadataUrl", "invalidUrl")}>
        {(c) => <SentryInput {...c} type="url" value={draft.metadataUrl} onChange={(e) => patch({ metadataUrl: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.certificate`)} hint={t(`${f}.certificateHint`)} optionalLabel={t("common.labels.optional")}>
        {(c) => (
          <Textarea {...c} rows={4} spellCheck={false} className="font-mono text-xs" value={draft.certificate} onChange={(e) => patch({ certificate: e.target.value })} />
        )}
      </FormField>
    </FormDialog>
  );
}

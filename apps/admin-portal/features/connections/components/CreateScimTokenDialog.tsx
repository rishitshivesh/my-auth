"use client";

import { useEffect, useState } from "react";
import { FormField, Label, RadioGroup, RadioGroupItem, SentryInput } from "@repo/ui";
import { FormDialog } from "@/features/applications/components/FormDialog";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useScimMutations } from "../api/connections";
import {
  EMPTY_SCIM_DRAFT, SCIM_EXPIRY_OPTIONS, toScimBody, validateScimDraft, type ScimDraft, type ScimExpiry,
} from "../model/scim";
import type { CreatedScimToken } from "../model/types";

export interface CreateScimTokenDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: CreatedScimToken) => void;
}

const EXPIRY_KEYS = {
  never: "tenantIntegrations.scim.form.expiryNever",
  "30": "tenantIntegrations.scim.form.expiry30",
  "90": "tenantIntegrations.scim.form.expiry90",
  "365": "tenantIntegrations.scim.form.expiry365",
} as const;

export function CreateScimTokenDialog({ slug, open, onOpenChange, onCreated }: CreateScimTokenDialogProps) {
  const { t, tk } = useCopy();
  const { create } = useScimMutations(slug);
  const [draft, setDraft] = useState<ScimDraft>(EMPTY_SCIM_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_SCIM_DRAFT);
      setSubmitted(false);
      setServerError(undefined);
    }
  }, [open]);

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateScimDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      onCreated(await create.mutateAsync(toScimBody(draft)));
      create.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tenantIntegrations.scim.form.title")}
      description={t("tenantIntegrations.scim.form.description")}
      submitLabel={t("tenantIntegrations.scim.form.submit")}
      onSubmit={onSubmit}
      pending={create.isPending}
      error={serverError}
    >
      <FormField
        label={t("tenantIntegrations.scim.form.name")}
        required
        error={submitted && validateScimDraft(draft).length > 0 ? t("tenantIntegrations.scim.form.nameRequired") : undefined}
      >
        {(c) => <SentryInput {...c} value={draft.name} autoComplete="off" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
      </FormField>
      <fieldset className="space-y-2">
        <legend className="font-display text-[13px] font-medium">{t("tenantIntegrations.scim.form.expiry")}</legend>
        <RadioGroup value={draft.expiry} onValueChange={(expiry) => setDraft({ ...draft, expiry: expiry as ScimExpiry })} className="gap-2">
          {SCIM_EXPIRY_OPTIONS.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`scim-expiry-${option}`} />
              <Label htmlFor={`scim-expiry-${option}`}>{tk(EXPIRY_KEYS[option])}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
    </FormDialog>
  );
}

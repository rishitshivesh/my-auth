"use client";

import { useState } from "react";
import { FormField, GlassCard, SentryButton, SentryInput } from "@repo/ui";
import { ToggleRow } from "@/components/page/ToggleRow";
import { useCopy } from "@/i18n";
import { validateSetup, type SetupDraft, type SetupField } from "../model/setup";

export interface SetupFormProps {
  pending: boolean;
  /** Server-side failure message; shown in an alert above the button. */
  failure?: string;
  onSubmit: (draft: SetupDraft) => void;
}

const EMPTY: SetupDraft = { setupToken: "", platformName: "", name: "", email: "", password: "", confirm: "" };

export function SetupForm({ pending, failure, onSubmit }: SetupFormProps) {
  const { t } = useCopy();
  const [draft, setDraft] = useState<SetupDraft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [reveal, setReveal] = useState(false);
  const errors = validateSetup(draft);
  const set = (key: keyof SetupDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });
  const err = (key: SetupField) => (submitted && errors[key] ? t(`platform.setup.errors.${errors[key] ?? "required"}`) : undefined);
  const secretType = reveal ? "text" : "password";

  return (
    <GlassCard tier={2} className="p-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (Object.keys(errors).length === 0) onSubmit(draft);
        }}
        className="space-y-4"
      >
        <FormField label={t("platform.setup.fields.setupToken")} required hint={t("platform.setup.tokenHelp")} error={err("setupToken")}>
          {(c) => <SentryInput {...c} type="password" autoComplete="off" spellCheck={false} className="font-mono" value={draft.setupToken} onChange={set("setupToken")} />}
        </FormField>
        <FormField label={t("platform.setup.fields.platformName")} optionalLabel={t("common.labels.optional")}>
          {(c) => <SentryInput {...c} autoComplete="organization" value={draft.platformName} onChange={set("platformName")} />}
        </FormField>
        <FormField label={t("platform.setup.fields.name")} required error={err("name")}>
          {(c) => <SentryInput {...c} autoComplete="name" value={draft.name} onChange={set("name")} />}
        </FormField>
        <FormField label={t("platform.setup.fields.email")} required error={err("email")}>
          {(c) => <SentryInput {...c} type="email" autoComplete="email" value={draft.email} onChange={set("email")} />}
        </FormField>
        <FormField label={t("platform.setup.fields.password")} required hint={t("platform.setup.fields.passwordHint")} error={err("password")}>
          {(c) => <SentryInput {...c} type={secretType} autoComplete="new-password" value={draft.password} onChange={set("password")} />}
        </FormField>
        <FormField label={t("platform.setup.fields.confirm")} required error={err("confirm")}>
          {(c) => <SentryInput {...c} type={secretType} autoComplete="new-password" value={draft.confirm} onChange={set("confirm")} />}
        </FormField>
        <ToggleRow label={t("platform.setup.fields.show")} checked={reveal} onChange={setReveal} />
        {failure && <p role="alert" className="font-body text-sm text-destructive">{failure}</p>}
        <SentryButton type="submit" className="w-full" isLoading={pending}>
          {pending ? t("platform.setup.submitting") : t("platform.setup.submit")}
        </SentryButton>
      </form>
    </GlassCard>
  );
}

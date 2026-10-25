"use client";

import { FormField, SentryInput, SettingsSection } from "@repo/ui";
import { ToggleRow } from "@/components/page/ToggleRow";
import { useCopy } from "@/i18n";
import {
  validatePolicyDraft, type PasswordPolicy, type PolicyDraft, isPolicyDirty,
} from "../model/password-policy";

type NumericField = "minLength" | "historyCount" | "maxAgeDays" | "lockoutThreshold" | "lockoutDurationMinutes";
const NUMERIC_FIELDS: readonly NumericField[] = ["minLength", "historyCount", "maxAgeDays", "lockoutThreshold", "lockoutDurationMinutes"];

export interface PasswordPolicyFormProps {
  saved: PasswordPolicy;
  draft: PolicyDraft;
  readOnly: boolean;
  pending: boolean;
  error?: string;
  savedMessage?: string;
  onChange: (next: PolicyDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function PasswordPolicyForm({ saved, draft, readOnly, pending, error, savedMessage, onChange, onSave, onDiscard }: PasswordPolicyFormProps) {
  const { t } = useCopy();
  const errors = validatePolicyDraft(draft);
  const invalid = Object.keys(errors).length > 0;
  const expiry = Number(draft.maxAgeDays) > 0;
  return (
    <SettingsSection
      title={t("tenantAdmin.security.password.title")}
      description={t("tenantAdmin.security.password.description")}
      dirty={isPolicyDirty(saved, draft)}
      invalid={invalid}
      pending={pending}
      error={error}
      savedMessage={savedMessage}
      readOnly={readOnly}
      onSave={onSave}
      onDiscard={onDiscard}
      saveLabel={t("tenantAdmin.security.password.save")}
      discardLabel={t("tenantAdmin.security.password.discard")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMERIC_FIELDS.map((field) => (
          <FormField
            key={field}
            label={t(`tenantAdmin.security.password.${field}`)}
            hint={t(`tenantAdmin.security.password.${field}Hint`)}
            error={errors[field] ? t(`tenantAdmin.security.password.errors.${errors[field]}`) : undefined}
          >
            {(control) => (
              <SentryInput
                {...control}
                inputMode="numeric"
                value={draft[field]}
                disabled={readOnly || pending}
                onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
              />
            )}
          </FormField>
        ))}
      </div>
      <ToggleRow
        label={t("tenantAdmin.security.password.requireCommonPasswordCheck")}
        checked={draft.requireCommonPasswordCheck}
        disabled={readOnly || pending}
        onChange={(checked) => onChange({ ...draft, requireCommonPasswordCheck: checked })}
      />
      <div className="space-y-1 rounded-sm border border-border bg-muted p-3 font-body text-xs text-muted-foreground">
        <p>{t("tenantAdmin.security.password.impact")}</p>
        {expiry && <p>{t("tenantAdmin.security.password.impactExpiry")}</p>}
      </div>
      {readOnly && <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.common.readOnlyNote")}</p>}
    </SettingsSection>
  );
}

"use client";

import { PROFILE_NAME_MAX_LENGTH, PROFILE_PHONE_MAX_LENGTH } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { SettingsSection } from "@repo/ui";
import type { ProfileDraft, ProfileErrors, ProfileField } from "../model/profile";
import { FieldInput } from "./FieldInput";

export interface ProfileFormProps {
  draft: ProfileDraft;
  email: string;
  emailVerified: boolean;
  errors: ProfileErrors;
  dirty: boolean;
  pending: boolean;
  serverError?: string;
  savedMessage?: string;
  onChange: (field: ProfileField, value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function ProfileForm({
  draft, email, emailVerified, errors, dirty, pending, serverError, savedMessage, onChange, onSave, onDiscard,
}: ProfileFormProps) {
  const { t } = useCopy();
  const err = (field: ProfileField): string | undefined => {
    const kind = errors[field];
    if (!kind) return undefined;
    if (kind === "tooLong") return t("account.profile.errors.tooLong", { max: field === "phone" ? PROFILE_PHONE_MAX_LENGTH : PROFILE_NAME_MAX_LENGTH });
    return t(`account.profile.errors.${kind}`);
  };
  const field = (name: ProfileField, label: string, extra: { hint?: string; autoComplete?: string; type?: string } = {}) => (
    <FieldInput
      label={label}
      value={draft[name]}
      onChange={(e) => onChange(name, e.target.value)}
      error={err(name)}
      optionalLabel={t("common.labels.optional")}
      hint={extra.hint}
      autoComplete={extra.autoComplete}
      type={extra.type}
      disabled={pending}
    />
  );
  return (
    <div>
      <SettingsSection
        title={t("account.profile.sectionTitle")}
        dirty={dirty}
        pending={pending}
        invalid={Object.keys(errors).length > 0}
        error={serverError}
        savedMessage={savedMessage}
        onSave={onSave}
        onDiscard={onDiscard}
        saveLabel={t("account.profile.save")}
        discardLabel={t("account.profile.discard")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", t("account.profile.firstName"), { autoComplete: "given-name" })}
          {field("lastName", t("account.profile.lastName"), { autoComplete: "family-name" })}
          {field("displayName", t("account.profile.displayName"), { autoComplete: "nickname" })}
          <FieldInput
            label={t("account.profile.email")}
            value={email}
            readOnly
            hint={`${emailVerified ? t("account.profile.emailVerified") : t("account.profile.emailUnverified")}. ${t("account.profile.emailHint")}`}
            type="email"
            autoComplete="email"
          />
          {field("phone", t("account.profile.phone"), { autoComplete: "tel", type: "tel" })}
          {field("timezone", t("account.profile.timezone"), { hint: t("account.profile.timezoneHint") })}
          {field("language", t("account.profile.language"), { hint: t("account.profile.languageHint"), autoComplete: "language" })}
        </div>
      </SettingsSection>
    </div>
  );
}

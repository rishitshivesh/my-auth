"use client";

import { useState } from "react";
import { FormField, SentryInput, SettingsSection } from "@repo/ui";
import { ToggleRow } from "@/components/page/ToggleRow";
import { useCopy } from "@/i18n";
import { errorText } from "@/lib/resource-status";
import { useSavePlatformSettings } from "../api/admin";
import {
  EMAIL_MAX, PLATFORM_NAME_MAX, isPlatformDirty, platformPayload, toPlatformDraft, validatePlatformDraft,
  type PlatformDraft,
} from "../model/settings";
import type { PlatformSettings } from "../model/types";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const { t } = useCopy();
  const save = useSavePlatformSettings();
  const [edit, setEdit] = useState<PlatformDraft | null>(null);
  const draft = edit ?? toPlatformDraft(settings);
  const errors = validatePlatformDraft(draft);
  const err = (key: "platformName" | "supportEmail") => (errors[key] ? t(`platform.settings.general.errors.${errors[key] ?? "required"}`) : undefined);

  return (
    <SettingsSection
      title={t("platform.settings.general.title")}
      description={t("platform.settings.general.description")}
      dirty={isPlatformDirty(settings, draft)}
      invalid={Object.keys(errors).length > 0}
      pending={save.isPending}
      error={errorText(save.error)}
      savedMessage={save.isSuccess ? t("platform.settings.general.saved") : undefined}
      saveLabel={t("platform.settings.general.save")}
      discardLabel={t("platform.settings.general.discard")}
      onDiscard={() => { setEdit(null); save.reset(); }}
      onSave={() => save.mutate(platformPayload(draft), { onSuccess: () => setEdit(null) })}
    >
      <FormField label={t("platform.settings.general.platformName")} required error={err("platformName")}>
        {(c) => <SentryInput {...c} maxLength={PLATFORM_NAME_MAX + 1} value={draft.platformName} onChange={(e) => setEdit({ ...draft, platformName: e.target.value })} />}
      </FormField>
      <FormField label={t("platform.settings.general.supportEmail")} hint={t("platform.settings.general.supportEmailHint")} error={err("supportEmail")}>
        {(c) => <SentryInput {...c} type="email" maxLength={EMAIL_MAX + 1} value={draft.supportEmail} onChange={(e) => setEdit({ ...draft, supportEmail: e.target.value })} />}
      </FormField>
      <ToggleRow
        label={t("platform.settings.general.allowPublicSignup")}
        hint={t("platform.settings.general.allowPublicSignupHint")}
        checked={draft.allowPublicSignup}
        onChange={(checked) => setEdit({ ...draft, allowPublicSignup: checked })}
      />
      <ToggleRow
        label={t("platform.settings.general.maintenanceMode")}
        hint={t("platform.settings.general.maintenanceModeHint")}
        checked={draft.maintenanceMode}
        onChange={(checked) => setEdit({ ...draft, maintenanceMode: checked })}
      />
    </SettingsSection>
  );
}

"use client";

import { FormField, SentryInput } from "@repo/ui";
import { SelectField, type SelectOption } from "@/components/page/SelectField";
import { useCopy } from "@/i18n";
import { BRANDING_FONTS, isValidHex, type Branding } from "../model/branding";

export interface BrandingAppearanceFieldsProps {
  draft: Branding;
  disabled: boolean;
  onChange: (next: Branding) => void;
}

const FONT_OPTIONS: readonly SelectOption[] = BRANDING_FONTS.map((font) => ({ value: font, label: font }));

export function BrandingAppearanceFields({ draft, disabled, onChange }: BrandingAppearanceFieldsProps) {
  const { t } = useCopy();
  const colorInvalid = !isValidHex(draft.primaryColor);
  const weights: readonly SelectOption[] = [
    { value: "regular", label: t("tenantAdmin.branding.appearance.regular") },
    { value: "bold", label: t("tenantAdmin.branding.appearance.bold") },
  ];
  const backgrounds: readonly SelectOption[] = [
    { value: "solid", label: t("tenantAdmin.branding.appearance.solid") },
    { value: "gradient", label: t("tenantAdmin.branding.appearance.gradient") },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label={t("tenantAdmin.branding.appearance.primaryColor")}
        hint={t("tenantAdmin.branding.appearance.primaryColorHint")}
        error={colorInvalid ? t("tenantAdmin.branding.appearance.invalidColor") : undefined}
      >
        {(control) => (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("tenantAdmin.branding.appearance.primaryColorPicker")}
              value={colorInvalid ? "#000000" : draft.primaryColor}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, primaryColor: e.target.value })}
              className="h-[42px] w-12 shrink-0 cursor-pointer rounded-sm border border-border bg-transparent p-1"
            />
            <SentryInput
              {...control}
              value={draft.primaryColor}
              disabled={disabled}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
              onChange={(e) => onChange({ ...draft, primaryColor: e.target.value })}
            />
          </div>
        )}
      </FormField>
      <SelectField label={t("tenantAdmin.branding.appearance.font")} value={draft.fontFamily} options={FONT_OPTIONS} disabled={disabled} onChange={(fontFamily) => onChange({ ...draft, fontFamily })} />
      <SelectField label={t("tenantAdmin.branding.appearance.headerWeight")} value={draft.headerWeight} options={weights} disabled={disabled} onChange={(v) => onChange({ ...draft, headerWeight: v === "bold" ? "bold" : "regular" })} />
      <SelectField label={t("tenantAdmin.branding.appearance.background")} value={draft.backgroundStyle} options={backgrounds} disabled={disabled} onChange={(v) => onChange({ ...draft, backgroundStyle: v === "gradient" ? "gradient" : "solid" })} />
    </div>
  );
}

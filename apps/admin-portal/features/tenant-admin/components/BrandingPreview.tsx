"use client";

import { GlassCard } from "@repo/ui";
import { useCopy } from "@/i18n";
import { brandContrast, isValidHex, type Branding } from "../model/branding";

/** Brand values are tenant data, so they are applied as inline styles; all other styling uses tokens. */
export function BrandingPreview({ draft }: { draft: Branding }) {
  const { t } = useCopy();
  const colour = isValidHex(draft.primaryColor) ? draft.primaryColor : undefined;
  const contrast = brandContrast(draft.primaryColor);
  const weight = draft.headerWeight === "bold" ? 700 : 400;
  const ratio = (value: number) => value.toFixed(1);
  return (
    <GlassCard tier={2} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.branding.preview.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.branding.preview.description")}</p>
      </header>
      <div
        className="space-y-4 rounded-md border border-border bg-card p-6"
        style={{
          fontFamily: draft.fontFamily,
          backgroundImage: draft.backgroundStyle === "gradient" && colour ? `linear-gradient(135deg, ${colour}22, transparent)` : undefined,
        }}
      >
        {draft.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted logo of arbitrary origin
          <img src={draft.logoUrl} alt={t("tenantAdmin.branding.preview.logoAlt")} className="max-h-10 max-w-full object-contain" />
        )}
        <h3 className="text-lg text-foreground" style={{ fontWeight: weight }}>{t("tenantAdmin.branding.preview.heading")}</h3>
        <div className="space-y-1.5">
          <span className="block text-xs text-muted-foreground">{t("tenantAdmin.branding.preview.email")}</span>
          <div className="h-[42px] rounded-sm border border-border bg-muted" aria-hidden="true" />
        </div>
        <div
          aria-hidden="true"
          className="flex h-[42px] items-center justify-center rounded-sm text-sm font-semibold text-primary-foreground"
          style={colour ? { backgroundColor: colour } : undefined}
        >
          {t("tenantAdmin.branding.preview.continue")}
        </div>
      </div>
      {contrast && (
        <section aria-labelledby="branding-contrast" className="space-y-1">
          <h3 id="branding-contrast" className="font-display text-sm font-semibold text-foreground">{t("tenantAdmin.branding.contrast.title")}</h3>
          <ul className="space-y-1 font-body text-sm text-foreground">
            <li>
              {t("tenantAdmin.branding.contrast.light", { ratio: ratio(contrast.light) })}
              {" - "}{contrast.lightOk ? t("tenantAdmin.branding.contrast.pass") : t("tenantAdmin.branding.contrast.fail")}
            </li>
            <li>
              {t("tenantAdmin.branding.contrast.dark", { ratio: ratio(contrast.dark) })}
              {" - "}{contrast.darkOk ? t("tenantAdmin.branding.contrast.pass") : t("tenantAdmin.branding.contrast.fail")}
            </li>
          </ul>
          {(!contrast.lightOk || !contrast.darkOk) && (
            <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.branding.contrast.warning")}</p>
          )}
        </section>
      )}
    </GlassCard>
  );
}

"use client";

import { useRef, useState } from "react";
import { GlassCard, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { errorText } from "@/lib/resource-status";
import { LOGO_TYPES, validateLogo } from "../model/branding";

export interface LogoUploadProps {
  logoUrl?: string;
  disabled: boolean;
  pending: boolean;
  uploaded: boolean;
  serverError: unknown;
  onUpload: (file: File) => void;
}

export function LogoUpload({ logoUrl, disabled, pending, uploaded, serverError, onUpload }: LogoUploadProps) {
  const { t } = useCopy();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<"type" | "size" | null>(null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    const problem = validateLogo(file);
    setLocalError(problem);
    if (!problem) onUpload(file);
    if (input.current) input.current.value = "";
  };
  const message = localError ? t(`tenantAdmin.branding.logo.errors.${localError}`) : errorText(serverError);

  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.branding.logo.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.branding.logo.description")}</p>
      </header>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted logo of arbitrary origin
        <img src={logoUrl} alt={t("tenantAdmin.branding.logo.current")} className="max-h-16 max-w-full object-contain" />
      ) : (
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.branding.logo.none")}</p>
      )}
      <input
        ref={input}
        type="file"
        accept={LOGO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <SentryButton variant="outline" disabled={disabled} isLoading={pending} onClick={() => input.current?.click()}>
        {pending ? t("tenantAdmin.branding.logo.uploading") : t("tenantAdmin.branding.logo.choose")}
      </SentryButton>
      <p role="alert" className="font-body text-sm text-destructive">{message}</p>
      <p role="status" className="font-body text-sm text-success-text">{uploaded && !message ? t("tenantAdmin.branding.logo.uploaded") : ""}</p>
    </GlassCard>
  );
}

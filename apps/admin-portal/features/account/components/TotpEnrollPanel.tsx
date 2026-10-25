"use client";

import { useState } from "react";
import { OtpInput, SecretReveal, SentryButton, StateView } from "@repo/ui";
import { OTP_LENGTH, SECRET_AUTO_HIDE_MS } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { Notice } from "./Notice";
import { useSecretLabels } from "./use-secret-labels";

export type EnrollStage = "starting" | "scan" | "codes";

export interface TotpEnrollPanelProps {
  stage: EnrollStage;
  /** One-time setup material; held only by the parent view while enrolling. */
  setup?: { secret: string; qrCode: string };
  /** Recovery codes returned when TOTP is switched on. */
  codes?: string;
  code: string;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  onCodesAcknowledged: () => void;
  pending: boolean;
  error?: string;
}

export function TotpEnrollPanel({
  stage, setup, codes, code, onCodeChange, onVerify, onCancel, onCodesAcknowledged, pending, error,
}: TotpEnrollPanelProps) {
  const { t } = useCopy();
  const [keyOpen, setKeyOpen] = useState(false);
  const secretLabels = useSecretLabels(undefined, t("account.mfa.enroll.hideKey"));
  const codeLabels = useSecretLabels(t("account.recovery.revealWarning"), t("account.recovery.done"));

  if (stage === "starting") return <StateView kind="loading" title={t("account.mfa.enroll.starting")} />;

  if (stage === "codes" && codes) {
    return (
      <div className="space-y-4">
        <Notice tone="success">{t("account.mfa.enroll.successTitle")}</Notice>
        <p className="font-body text-sm text-muted-foreground">{t("account.mfa.enroll.successBody")}</p>
        <SecretReveal
          secret={codes}
          labels={codeLabels}
          fieldLabel={t("account.recovery.revealField")}
          onAcknowledge={onCodesAcknowledged}
          autoHideMs={SECRET_AUTO_HIDE_MS}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="font-display text-sm font-semibold text-foreground">{t("account.mfa.enroll.title")}</h3>
      {setup && (
        <>
          <p className="font-body text-sm text-muted-foreground">{t("account.mfa.enroll.scanLabel")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- one-time data URL, never cached */}
          <img
            src={setup.qrCode}
            alt={t("account.mfa.enroll.qrAlt")}
            className="h-44 w-44 rounded-sm border border-border bg-background p-2"
          />
          <details className="space-y-2" open={keyOpen} onToggle={(e) => setKeyOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer font-body text-sm text-foreground">{t("account.mfa.enroll.cantScan")}</summary>
            <SecretReveal
              secret={setup.secret}
              labels={secretLabels}
              fieldLabel={t("account.mfa.enroll.secretField")}
              onAcknowledge={() => setKeyOpen(false)}
              autoHideMs={SECRET_AUTO_HIDE_MS}
            />
          </details>
        </>
      )}
      <div className="space-y-2">
        <p id="totp-code-label" className="font-body text-sm text-foreground">{t("account.mfa.enroll.codeLabel")}</p>
        <OtpInput
          length={OTP_LENGTH}
          value={code}
          onChange={onCodeChange}
          onComplete={onVerify}
          label={t("account.mfa.enroll.codeLabel")}
          describedBy="totp-code-hint"
          invalid={Boolean(error)}
          disabled={pending}
        />
        <p id="totp-code-hint" className="text-center font-body text-xs text-muted-foreground">
          {t("account.mfa.enroll.codeHint")}
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <SentryButton variant="primary" isLoading={pending} disabled={code.length !== OTP_LENGTH} onClick={onVerify}>
          {t("account.mfa.enroll.verify")}
        </SentryButton>
        <SentryButton variant="outline" disabled={pending} onClick={onCancel}>
          {t("account.mfa.enroll.cancel")}
        </SentryButton>
      </div>
    </div>
  );
}

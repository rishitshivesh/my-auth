"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SentryButton, StateView } from "@repo/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui/components/ui/dialog";
import { OTP_LENGTH } from "@/constants/limits";
import { useCopy } from "@/i18n";
import type { StepUpPhase, StepUpFailure } from "../api/use-step-up-dialog";
import { stepUpIssue, stepUpModes, type StepUpMode } from "../model/step-up";
import type { ReauthRequirements } from "@scrolloop/sdk";
import { FieldInput } from "./FieldInput";
import { Notice } from "./Notice";

const FAILURE_KEYS = {
  "wrong-password": "account.stepUp.failures.wrongPassword",
  "wrong-code": "account.stepUp.failures.wrongCode",
  "rate-limited": "account.stepUp.failures.rateLimited",
  "passkey-cancelled": "account.stepUp.failures.passkeyCancelled",
  "mfa-required": "account.stepUp.failures.mfaRequired",
  generic: "account.stepUp.failures.generic",
} as const;

export interface StepUpDialogProps {
  phase: StepUpPhase;
  requirements: ReauthRequirements | null;
  mode: StepUpMode;
  pending: boolean;
  failure: StepUpFailure | null;
  onModeChange: (mode: StepUpMode) => void;
  onSubmit: (password: string, code: string) => void;
  onPasskey: () => void;
  onClose: () => void;
}

/** Re-confirm identity in place: password, plus authenticator code or passkey when two-step is on. */
export function StepUpDialog({ phase, requirements, mode, pending, failure, onModeChange, onSubmit, onPasskey, onClose }: StepUpDialogProps) {
  const { t, tk } = useCopy();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const isOpen = phase !== "closed";

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setCode("");
      setTouched(false);
    }
  }, [isOpen]);

  const issue = stepUpIssue(mode, password, code);
  const modes = requirements ? stepUpModes(requirements) : null;
  const other = modes ? [modes.initial, ...modes.alternatives].filter((m) => m !== mode && m !== "unsupported") : [];

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (!issue) onSubmit(password, code);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("account.stepUp.title")}</DialogTitle>
          <DialogDescription>{t("account.stepUp.description")}</DialogDescription>
        </DialogHeader>
        {phase === "loading" && <StateView kind="loading" title={t("account.stepUp.loading")} />}
        {phase === "failed-load" && (
          <StateView kind="error" title={t("account.stepUp.loadFailed")} action={{ label: t("account.stepUp.close"), onClick: onClose }} />
        )}
        {phase === "form" && mode === "unsupported" && (
          <div className="space-y-3">
            <Notice tone="info">{t("account.stepUp.unsupported")}</Notice>
            <SentryButton type="button" variant="outline" onClick={onClose}>{t("account.stepUp.close")}</SentryButton>
          </div>
        )}
        {phase === "form" && mode !== "unsupported" && (
          <form onSubmit={submit} noValidate className="space-y-4" aria-label={t("account.stepUp.title")}>
            <div role="alert">{failure && <p className="font-body text-sm text-destructive">{tk(FAILURE_KEYS[failure.kind])}</p>}</div>
            {mode !== "passkey" && (
              <FieldInput
                label={t("account.stepUp.password")}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={touched && issue === "password-empty" ? t("common.validation.required") : undefined}
                disabled={pending}
                autoFocus
                required
              />
            )}
            {mode === "password-totp" && (
              <FieldInput
                label={t("account.stepUp.code")}
                hint={t("account.stepUp.codeHint", { length: OTP_LENGTH })}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                error={touched && issue === "code-incomplete" ? t("auth.otp.invalid") : undefined}
                disabled={pending}
                required
              />
            )}
            {mode === "passkey" ? (
              <SentryButton type="button" variant="primary" className="w-full" isLoading={pending} onClick={onPasskey}>
                {t("account.stepUp.passkeyAction")}
              </SentryButton>
            ) : (
              <SentryButton type="submit" variant="primary" className="w-full" isLoading={pending}>
                {t("account.stepUp.confirm")}
              </SentryButton>
            )}
            {other.map((m) => (
              <SentryButton key={m} type="button" variant="ghost" size="sm" className="w-full border-0" onClick={() => onModeChange(m)} disabled={pending}>
                {m === "passkey" ? t("account.stepUp.usePasskey") : t("account.stepUp.usePasswordCode")}
              </SentryButton>
            ))}
            <SentryButton type="button" variant="outline" className="w-full" onClick={onClose} disabled={pending}>
              {t("account.stepUp.cancel")}
            </SentryButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

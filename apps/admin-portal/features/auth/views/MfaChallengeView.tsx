"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormField, SentryButton, SentryInput, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { OTP_LENGTH, RECOVERY_CODE_LENGTH } from "@/constants/limits";
import { useMfaChallenge } from "../api/use-mfa-challenge";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { CodeField } from "../components/CodeField";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { loginFailureText } from "../components/failure-text";
import { hasUnsupportedMethods, type ChallengeMethod } from "../model/challenge";
import type { Failure } from "../model/failure";
import { t as translate } from "@/i18n";

function mfaFailureText(failure: Failure): string {
  return failure.kind === "invalid-code" || failure.kind === "invalid-credentials"
    ? translate("auth.mfa.invalidCode")
    : loginFailureText(failure);
}

export function MfaChallengeView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const { state, pending, failure, submit, restart } = useMfaChallenge();
  const [mode, setMode] = useState<Extract<ChallengeMethod, "totp" | "backup">>("totp");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState("");

  if (state.status === "loading") {
    return (
      <HostedFrame title={t("auth.mfa.title")} branding={branding}>
        <StateView kind="loading" title={t("common.labels.loading")} />
      </HostedFrame>
    );
  }

  if (state.status === "missing") {
    return (
      <HostedFrame title={t("auth.mfa.expiredTitle")} branding={branding}>
        <StateView
          kind="unavailable"
          title={t("auth.mfa.expiredTitle")}
          description={t("auth.mfa.expiredDescription")}
          action={{ label: t("auth.mfa.restart"), onClick: () => window.location.assign(authRoutes.login()) }}
        />
      </HostedFrame>
    );
  }

  const { challenge } = state;
  const error = failure ? mfaFailureText(failure) : undefined;
  const isBackup = mode === "backup";

  const switchMode = (next: "totp" | "backup"): void => {
    setMode(next);
    setCode("");
    setBackup("");
  };

  const onFormSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (isBackup && backup.trim().length > 0) void submit("backup", backup.trim());
    if (!isBackup && code.length === OTP_LENGTH) void submit("totp", code);
  };

  return (
    <HostedFrame
      title={isBackup ? t("auth.mfa.backupTitle") : t("auth.mfa.title")}
      description={isBackup ? t("auth.mfa.backupDescription") : t("auth.mfa.description")}
      branding={branding}
      footer={
        <Link href={authRoutes.login()} onClick={restart} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("auth.mfa.cancel")}
        </Link>
      }
    >
      <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
        <FormAlert message={error} reference={failure?.requestId} />
        {hasUnsupportedMethods(challenge.methods) && (
          <p className="font-body text-xs text-muted-foreground">{t("auth.mfa.unsupportedMethods")}</p>
        )}
        {isBackup ? (
          <FormField label={t("auth.mfa.backupLabel")} hint={t("auth.mfa.backupHint")} required>
            {(control) => (
              <SentryInput
                {...control}
                name="recovery-code"
                value={backup}
                onChange={(event) => setBackup(event.target.value)}
                maxLength={RECOVERY_CODE_LENGTH * 2}
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                disabled={pending}
              />
            )}
          </FormField>
        ) : (
          <CodeField
            label={t("auth.otp.label")}
            value={code}
            onChange={setCode}
            onComplete={(value) => void submit("totp", value)}
            hint={t("auth.otp.hint", { length: OTP_LENGTH })}
            disabled={pending}
            autoFocus
          />
        )}
        {challenge.remainingAttempts !== undefined && (
          <p role="status" className="text-center font-body text-xs text-muted-foreground">
            {t("auth.mfa.attempts", { count: challenge.remainingAttempts })}
          </p>
        )}
        <SentryButton type="submit" className="w-full" isLoading={pending} disabled={isBackup ? backup.trim().length === 0 : code.length < OTP_LENGTH}>
          {pending ? t("auth.mfa.verifying") : t("auth.mfa.submit")}
        </SentryButton>
        <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={() => switchMode(isBackup ? "totp" : "backup")} disabled={pending}>
          {isBackup ? t("auth.mfa.useAuthenticator") : t("auth.mfa.useBackupCode")}
        </SentryButton>
      </form>
    </HostedFrame>
  );
}

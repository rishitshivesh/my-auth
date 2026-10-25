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
import { MfaMethodSwitch } from "../components/MfaMethodSwitch";
import { loginFailureText } from "../components/failure-text";
import { initialMethod, offeredMethods, type ChallengeMethod } from "../model/challenge";
import type { Failure } from "../model/failure";
import { t as translate } from "@/i18n";

function mfaFailureText(failure: Failure): string {
  return failure.kind === "invalid-code" || failure.kind === "invalid-credentials"
    ? translate("auth.mfa.invalidCode")
    : loginFailureText(failure);
}

const TITLE_KEYS = {
  totp: "auth.mfa.title",
  email: "auth.mfa.emailTitle",
  webauthn: "auth.mfa.passkeyTitle",
  backup: "auth.mfa.backupTitle",
} as const;

const DESCRIPTION_KEYS = {
  totp: "auth.mfa.description",
  email: "auth.mfa.emailDescription",
  webauthn: "auth.mfa.passkeyDescription",
  backup: "auth.mfa.backupDescription",
} as const;

export function MfaChallengeView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t, tk } = useCopy();
  const flow = useMfaChallenge();
  const { state, pending, failure } = flow;
  const [chosen, setChosen] = useState<ChallengeMethod | null>(null);
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
  const offered = offeredMethods(challenge.methods);
  const mode = chosen ?? initialMethod(challenge.methods, challenge.preferred);
  const error = failure ? mfaFailureText(failure) : undefined;

  const choose = (next: ChallengeMethod): void => {
    setChosen(next);
    setCode("");
    setBackup("");
  };

  const onFormSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (mode === "backup" && backup.trim().length > 0) void flow.submit("backup", backup.trim());
    else if ((mode === "totp" || mode === "email") && code.length === OTP_LENGTH) void flow.submit(mode, code);
  };

  const needsEmailSend = mode === "email" && !flow.emailSent;

  return (
    <HostedFrame
      title={tk(TITLE_KEYS[mode])}
      description={tk(DESCRIPTION_KEYS[mode])}
      branding={branding}
      footer={
        <Link href={authRoutes.login()} onClick={flow.restart} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("auth.mfa.cancel")}
        </Link>
      }
    >
      <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
        <FormAlert message={error} reference={failure?.requestId} />
        {mode === "backup" && (
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
        )}
        {mode === "webauthn" && (
          <SentryButton type="button" variant="accent" className="w-full" isLoading={pending} onClick={() => void flow.usePasskey()}>
            {t("auth.mfa.passkeyAction")}
          </SentryButton>
        )}
        {needsEmailSend && (
          <SentryButton type="button" variant="accent" className="w-full" isLoading={pending} onClick={() => void flow.sendEmailCode()}>
            {t("auth.mfa.emailSend")}
          </SentryButton>
        )}
        {(mode === "totp" || (mode === "email" && flow.emailSent)) && (
          <CodeField
            label={t("auth.otp.label")}
            value={code}
            onChange={setCode}
            onComplete={(value) => void flow.submit(mode, value)}
            hint={mode === "email" ? t("auth.mfa.emailSentHint") : t("auth.otp.hint", { length: OTP_LENGTH })}
            disabled={pending}
            autoFocus
          />
        )}
        {challenge.remainingAttempts !== undefined && (
          <p role="status" className="text-center font-body text-xs text-muted-foreground">
            {t("auth.mfa.attempts", { count: challenge.remainingAttempts })}
          </p>
        )}
        {mode !== "webauthn" && !needsEmailSend && (
          <SentryButton type="submit" className="w-full" isLoading={pending} disabled={mode === "backup" ? backup.trim().length === 0 : code.length < OTP_LENGTH}>
            {pending ? t("auth.mfa.verifying") : t("auth.mfa.submit")}
          </SentryButton>
        )}
        <MfaMethodSwitch current={mode} offered={offered} disabled={pending} onChoose={choose} />
      </form>
    </HostedFrame>
  );
}

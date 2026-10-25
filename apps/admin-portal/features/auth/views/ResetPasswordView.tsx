"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormField, SentryButton, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { email as emailValidator, required, validate } from "@/lib/validation";
import { useAuthApi } from "../api/use-auth-api";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { CodeField } from "../components/CodeField";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { PasswordInput } from "../components/PasswordInput";
import { ResendControl } from "../components/ResendControl";
import { SuccessPanel } from "../components/SuccessPanel";
import { passwordIssueText } from "../components/password-issue-text";
import { waitText } from "../components/failure-text";
import { describeFailure, type Failure } from "../model/failure";
import { resetIssue, type ResetStep } from "../model/reset-flow";

export function ResetPasswordView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t, tk } = useCopy();
  const router = useRouter();
  // TODO(gap:Password recovery by link): `?token=` is ignored until the backend issues link tokens.
  const params = useSearchParams();
  const { api } = useAuthApi();
  const [step, setStep] = useState<ResetStep>("request");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const toLogin = (): void => router.push(authRoutes.login({ email: email || undefined }));

  const run = async (action: () => Promise<void>): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      setPending(false);
    }
  };

  const emailIssue = validate(email, [required, emailValidator]);
  const submitRequest = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (emailIssue) return;
    // Always advances: the acknowledgement is identical for unknown accounts.
    void run(async () => {
      await api.forgotPassword(email.trim());
      setTouched(false);
      setStep("reset");
    });
  };

  const issue = resetIssue({ code, password, confirm, email });
  const submitReset = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (issue) return;
    void run(async () => {
      await api.resetPassword(email.trim(), code, password);
      setStep("done");
    });
  };

  const errorText = (f: Failure): string => {
    if (f.kind === "invalid-code" || f.kind === "invalid-credentials") return t("auth.reset.invalidCode");
    if (f.kind === "policy") return t("auth.reset.failures.policy");
    if (f.kind === "rate-limited" || f.kind === "locked") return t("auth.reset.failures.rateLimited", { wait: waitText(f.retryAfterSeconds) });
    return t("auth.reset.failures.generic");
  };

  if (step === "done") {
    return (
      <HostedFrame title={t("auth.reset.doneTitle")} branding={branding}>
        <SuccessPanel title={t("auth.reset.doneTitle")} description={t("auth.reset.doneDescription")} actionLabel={t("auth.reset.doneAction")} onAction={toLogin} />
      </HostedFrame>
    );
  }

  if (step === "request") {
    return (
      <HostedFrame title={t("auth.reset.requestTitle")} description={t("auth.reset.requestDescription")} branding={branding}>
        <form onSubmit={submitRequest} noValidate className="space-y-4">
          <FormAlert message={failure ? errorText(failure) : undefined} reference={failure?.requestId} />
          <FormField label={t("auth.reset.emailLabel")} required error={touched && emailIssue ? tk(emailIssue.key, emailIssue.params) : undefined}>
            {(c) => <SentryInput {...c} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />}
          </FormField>
          <SentryButton type="submit" className="w-full" isLoading={pending}>
            {pending ? t("auth.reset.sendingCode") : t("auth.reset.sendCode")}
          </SentryButton>
          <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={toLogin}>
            {t("auth.reset.backToSignIn")}
          </SentryButton>
        </form>
      </HostedFrame>
    );
  }

  const fieldError = touched ? issue : null;
  return (
    <HostedFrame title={t("auth.reset.newPasswordTitle")} description={t("auth.reset.sentDescription", { email: email.trim() })} branding={branding}>
      <form onSubmit={submitReset} noValidate className="space-y-4">
        <FormAlert message={failure ? errorText(failure) : undefined} reference={failure?.requestId} />
        <p className="font-body text-xs text-muted-foreground">{t("auth.reset.linkNotice")}</p>
        <CodeField label={t("auth.reset.codeLabel")} value={code} onChange={setCode} error={fieldError === "code-incomplete" ? t("auth.otp.invalid") : undefined} disabled={pending} autoFocus />
        <FormField label={t("auth.reset.newPassword")} required hint={t("auth.reset.newPasswordHint")} error={fieldError === "password-empty" ? t("common.validation.required") : passwordIssueText(fieldError && fieldError !== "mismatch" && fieldError !== "code-incomplete" ? fieldError : null)}>
          {(c) => <PasswordInput control={c} value={password} onChange={setPassword} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <FormField label={t("auth.reset.confirmPassword")} required error={fieldError === "mismatch" ? t("auth.reset.mismatch") : undefined}>
          {(c) => <PasswordInput control={c} name="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <SentryButton type="submit" className="w-full" isLoading={pending}>
          {pending ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </SentryButton>
        <ResendControl email={email.trim()} failureMessage={t("auth.reset.failures.generic")} onResend={async () => void (await api.forgotPassword(email.trim()))} />
        <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={toLogin}>
          {t("auth.reset.backToSignIn")}
        </SentryButton>
      </form>
    </HostedFrame>
  );
}

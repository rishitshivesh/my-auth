"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField, SentryButton, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useDestination } from "../api/use-destination";
import { useResetLink } from "../api/use-reset-link";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { PasswordInput } from "../components/PasswordInput";
import { SuccessPanel } from "../components/SuccessPanel";
import { waitText } from "../components/failure-text";
import { passwordIssueText } from "../components/password-issue-text";
import { checkPassword } from "../model/password-policy";
import { LinkLandingView } from "./LinkLandingView";

/** /u/reset-password?token=… — validate (read-only), choose a password, spend the link on submit. */
export function ResetByLinkView({ token, branding }: { token: string; branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const { follow } = useDestination();
  const { state, pending, failure, submit } = useResetLink(token);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const toLogin = (): void => router.push(authRoutes.login());
  const toRequest = (): void => router.push(authRoutes.resetPassword());

  if (state.status === "checking") {
    return (
      <HostedFrame title={t("auth.reset.linkTitle")} branding={branding}>
        <StateView kind="loading" title={t("auth.linkLanding.loading.title")} />
      </HostedFrame>
    );
  }

  if (state.status === "failed") {
    // Expired and invalid links lead to a fresh request; a used link means the password was already changed.
    return (
      <HostedFrame title={t("auth.reset.linkTitle")} branding={branding}>
        <LinkLandingView
          status={state.reason}
          purpose={t("auth.linkLanding.purposes.resetPassword")}
          onContinue={state.reason === "expired" ? toRequest : toLogin}
          onSecondary={state.reason === "expired" ? toLogin : toRequest}
          alternateDeviceHint={null}
        />
      </HostedFrame>
    );
  }

  if (state.status === "done") {
    const { destination } = state;
    return (
      <HostedFrame title={t("auth.reset.doneTitle")} branding={branding}>
        <SuccessPanel
          title={t("auth.reset.doneTitle")}
          description={t("auth.reset.doneDescription")}
          actionLabel={t("auth.reset.doneAction")}
          onAction={() => (destination ? follow(destination) : toLogin())}
        />
      </HostedFrame>
    );
  }

  const issue = checkPassword(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const passwordError = touched ? (password.length === 0 ? t("common.validation.required") : passwordIssueText(issue)) : undefined;
  const failureText = failure
    ? failure.kind === "policy"
      ? t("auth.reset.failures.policy")
      : failure.kind === "rate-limited"
        ? t("auth.reset.failures.rateLimited", { wait: waitText(failure.retryAfterSeconds) })
        : t("auth.reset.failures.generic")
    : undefined;

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (password.length === 0 || issue || password !== confirm) return;
    void submit(password);
  };

  return (
    <HostedFrame title={t("auth.reset.newPasswordTitle")} description={t("auth.reset.linkDescription")} branding={branding}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={failureText} reference={failure?.requestId} />
        <FormField label={t("auth.reset.newPassword")} required hint={t("auth.reset.newPasswordHint")} error={passwordError}>
          {(c) => <PasswordInput control={c} value={password} onChange={setPassword} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <FormField label={t("auth.reset.confirmPassword")} required error={touched && mismatch ? t("auth.reset.mismatch") : undefined}>
          {(c) => <PasswordInput control={c} name="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <SentryButton type="submit" className="w-full" isLoading={pending}>
          {pending ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </SentryButton>
        <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={toLogin} disabled={pending}>
          {t("auth.reset.backToSignIn")}
        </SentryButton>
      </form>
    </HostedFrame>
  );
}

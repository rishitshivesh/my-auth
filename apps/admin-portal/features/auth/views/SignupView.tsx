"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormField, SentryButton, SentryInput } from "@repo/ui";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { email as emailValidator, required, validate } from "@/lib/validation";
import { useAuthApi } from "../api/use-auth-api";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { LinkSentStep } from "../components/LinkSentStep";
import { PasswordInput } from "../components/PasswordInput";
import { passwordIssueText } from "../components/password-issue-text";
import { waitText } from "../components/failure-text";
import { describeFailure, type Failure } from "../model/failure";
import { checkPassword } from "../model/password-policy";

function signupFailureText(failure: Failure, t: ReturnType<typeof useCopy>["t"]): string {
  if (failure.kind === "rate-limited") return t("auth.signup.failures.rateLimited", { wait: waitText(failure.retryAfterSeconds) });
  if (failure.kind === "policy") return t("auth.signup.failures.policy");
  return t("auth.signup.failures.generic");
}

/**
 * Registration answers identically for existing and new emails (no enumeration), so the
 * confirmation never says whether an account was created.
 * TODO(gap:Passwordless sign-up): password stays required until register accepts passwordless.
 */
export function SignupView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t, tk } = useCopy();
  const router = useRouter();
  const { api } = useAuthApi();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailIssue = validate(form.email, [required, emailValidator]);
  const passwordIssue = checkPassword(form.password, form.email);
  const passwordError = touched ? (form.password.length === 0 ? t("common.validation.required") : passwordIssueText(passwordIssue)) : undefined;
  const set = (key: keyof typeof form) => (value: string): void => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setTouched(true);
    if (emailIssue || passwordIssue || form.password.length === 0) return;
    setPending(true);
    setFailure(null);
    try {
      await api.register({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
      });
      setSentTo(form.email.trim());
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <HostedFrame title={t("auth.signup.sentTitle")} branding={branding}>
        <LinkSentStep
          title={t("auth.signup.sentTitle")}
          description={t("auth.signup.sentDescription", { email: sentTo })}
          email={sentTo}
          onResend={async () => void (await api.resendVerification(sentTo))}
          resendFailure={t("auth.verifyEmail.resendFailed")}
          backLabel={t("auth.magicLink.back")}
          onBack={() => router.push(authRoutes.login({ email: sentTo }))}
        />
      </HostedFrame>
    );
  }

  return (
    <HostedFrame
      title={t("auth.signup.title")}
      description={t("auth.signup.description")}
      branding={branding}
      footer={<Link href={authRoutes.login()} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("auth.signup.haveAccount")}</Link>}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <FormAlert message={failure ? signupFailureText(failure, t) : undefined} reference={failure?.requestId} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("auth.signup.firstName")} optionalLabel={t("common.labels.optional")}>
            {(c) => <SentryInput {...c} name="firstName" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} disabled={pending} />}
          </FormField>
          <FormField label={t("auth.signup.lastName")} optionalLabel={t("common.labels.optional")}>
            {(c) => <SentryInput {...c} name="lastName" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} disabled={pending} />}
          </FormField>
        </div>
        <FormField label={t("auth.signup.email")} required error={touched && emailIssue ? tk(emailIssue.key, emailIssue.params) : undefined}>
          {(c) => <SentryInput {...c} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={(e) => set("email")(e.target.value)} disabled={pending} />}
        </FormField>
        <FormField label={t("auth.signup.password")} required hint={t("auth.signup.passwordHint")} error={passwordError}>
          {(c) => <PasswordInput control={c} value={form.password} onChange={set("password")} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <SentryButton type="submit" className="w-full" isLoading={pending}>
          {pending ? t("auth.signup.submitting") : t("auth.signup.submit")}
        </SentryButton>
      </form>
    </HostedFrame>
  );
}

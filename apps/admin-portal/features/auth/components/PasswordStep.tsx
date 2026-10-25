"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormField, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { PasswordInput } from "./PasswordInput";

export interface PasswordStepProps {
  email: string;
  pending: boolean;
  onSubmit: (password: string) => void;
  onBack: () => void;
}

export function PasswordStep({ email, pending, onSubmit, onBack }: PasswordStepProps) {
  const { t } = useCopy();
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (password.length > 0) onSubmit(password);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-center font-body text-sm text-muted-foreground">{t("auth.login.signedInAs", { email })}</p>
      <FormField label={t("auth.login.passwordLabel")} required>
        {(control) => (
          <PasswordInput control={control} value={password} onChange={setPassword} autoComplete="current-password" disabled={pending} autoFocus />
        )}
      </FormField>
      <div className="text-right">
        <Link href={authRoutes.resetPassword()} className="font-body text-xs text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("auth.login.forgotPassword")}
        </Link>
      </div>
      <SentryButton type="submit" className="w-full" isLoading={pending} disabled={password.length === 0}>
        {pending ? t("auth.login.signingIn") : t("auth.login.title")}
      </SentryButton>
      <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={onBack} disabled={pending}>
        {t("common.actions.back")}
      </SentryButton>
    </form>
  );
}

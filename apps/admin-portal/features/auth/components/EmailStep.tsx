"use client";

import { useState, type FormEvent } from "react";
import { FormField, SentryButton, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import { email as emailValidator, required, validate } from "@/lib/validation";
import { SocialButtons } from "./SocialButtons";

export interface EmailStepProps {
  initialEmail: string;
  pending: boolean;
  social: readonly string[];
  onSubmit: (email: string) => void;
  onSocial: (provider: string) => void;
}

export function EmailStep({ initialEmail, pending, social, onSubmit, onSocial }: EmailStepProps) {
  const { t, tk } = useCopy();
  const [value, setValue] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const issue = validate(value, [required, emailValidator]);
  const error = touched && issue ? tk(issue.key, issue.params) : undefined;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (!issue) onSubmit(value.trim());
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField label={t("auth.login.emailLabel")} error={error} required>
        {(control) => (
          <SentryInput
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder={t("auth.login.emailPlaceholder")}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            disabled={pending}
          />
        )}
      </FormField>
      <SentryButton type="submit" className="w-full" isLoading={pending}>
        {pending ? t("auth.login.signingIn") : t("auth.login.continue")}
      </SentryButton>
      {social.length > 0 && (
        <>
          <p aria-hidden="true" className="text-center font-body text-xs text-muted-foreground">
            {t("auth.login.orDivider")}
          </p>
          <SocialButtons providers={social} onSelect={onSocial} disabled={pending} />
        </>
      )}
    </form>
  );
}

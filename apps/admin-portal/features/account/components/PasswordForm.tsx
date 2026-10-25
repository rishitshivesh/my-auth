"use client";

import { useState } from "react";
import { GlassCard, SentryButton } from "@repo/ui";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { type PasswordDraft, type PasswordErrors } from "../model/password";
import { FieldInput } from "./FieldInput";
import { Notice } from "./Notice";

export interface PasswordFormProps {
  draft: PasswordDraft;
  /** Errors for fields the user has already touched. */
  errors: PasswordErrors;
  ready: boolean;
  pending: boolean;
  serverError?: string;
  success: boolean;
  needsReauth: boolean;
  onChange: (field: keyof PasswordDraft, value: string) => void;
  onBlur: (field: keyof PasswordDraft) => void;
  onSubmit: () => void;
  onReauthenticate: () => void;
}

export function PasswordForm({
  draft, errors, ready, pending, serverError, success, needsReauth, onChange, onBlur, onSubmit, onReauthenticate,
}: PasswordFormProps) {
  const { t } = useCopy();
  const [visible, setVisible] = useState(false);
  const type = visible ? "text" : "password";
  const err = (f: keyof PasswordDraft): string | undefined => {
    const kind = errors[f];
    if (!kind) return undefined;
    return t(`account.password.errors.${kind}`, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
  };
  const input = (f: keyof PasswordDraft, label: string, autoComplete: string, hint?: string) => (
    <FieldInput
      label={label}
      type={type}
      autoComplete={autoComplete}
      value={draft[f]}
      onChange={(e) => onChange(f, e.target.value)}
      onBlur={() => onBlur(f)}
      error={err(f)}
      hint={hint}
      disabled={pending}
      required
    />
  );
  return (
    <GlassCard tier={1} className="p-6">
      <section aria-labelledby="account-password-title" className="space-y-4">
        <header className="space-y-1">
          <h2 id="account-password-title" className="font-display text-base font-semibold text-foreground">
            {t("account.password.title")}
          </h2>
          <p className="font-body text-sm text-muted-foreground">{t("account.password.description")}</p>
        </header>
        <div className="grid gap-4 sm:max-w-md">
          {input("current", t("account.password.current"), "current-password")}
          {input("next", t("account.password.next"), "new-password", t("account.password.nextHint", { min: PASSWORD_MIN_LENGTH }))}
          {input("confirm", t("account.password.confirm"), "new-password")}
          <SentryButton
            variant="ghost"
            size="sm"
            className="w-fit"
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? t("account.password.hide") : t("account.password.show")}
          </SentryButton>
        </div>
        <p className="font-body text-xs text-muted-foreground">{t("account.password.consequences")}</p>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {needsReauth && (
          <div className="space-y-2">
            <Notice tone="info">{t("account.security.reauthNotice")}</Notice>
            <SentryButton variant="outline" onClick={onReauthenticate}>{t("account.security.reauthAction")}</SentryButton>
          </div>
        )}
        {success && <Notice tone="success">{t("account.password.success")}</Notice>}
        <SentryButton variant="primary" isLoading={pending} disabled={!ready} onClick={onSubmit}>
          {t("account.password.submit")}
        </SentryButton>
      </section>
    </GlassCard>
  );
}

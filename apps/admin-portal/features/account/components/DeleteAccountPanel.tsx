"use client";

import { GlassCard, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { FieldInput } from "./FieldInput";
import { Notice } from "./Notice";

export interface DeleteAccountPanelProps {
  password: string;
  onPasswordChange: (value: string) => void;
  passwordError?: string;
  serverError?: string;
  onStart: () => void;
  onCancel: () => void;
}

export function DeleteAccountPanel({
  password, onPasswordChange, passwordError, serverError, onStart, onCancel,
}: DeleteAccountPanelProps) {
  const { t } = useCopy();
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <section aria-labelledby="delete-account-title" className="space-y-4">
        <header className="space-y-1">
          <h2 id="delete-account-title" className="font-display text-base font-semibold text-destructive">
            {t("account.delete.title")}
          </h2>
          <p className="font-body text-sm text-muted-foreground">{t("account.delete.description")}</p>
        </header>
        <div className="space-y-2">
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("account.delete.consequencesTitle")}
          </h3>
          <ul className="list-disc space-y-1 pl-5 font-body text-sm text-foreground">
            <li>{t("account.delete.consequences.e1")}</li>
            <li>{t("account.delete.consequences.e2")}</li>
            <li>{t("account.delete.consequences.e3")}</li>
          </ul>
        </div>
        <p className="font-body text-sm text-muted-foreground">{t("account.delete.scopeNote")}</p>
        <div className="sm:max-w-sm">
          <FieldInput
            label={t("account.delete.password")}
            hint={t("account.delete.passwordHint")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            error={passwordError}
            required
          />
        </div>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        <div className="flex flex-wrap gap-3">
          <SentryButton variant="destructive" onClick={onStart}>{t("account.delete.start")}</SentryButton>
          <SentryButton variant="outline" onClick={onCancel}>{t("account.delete.cancel")}</SentryButton>
        </div>
      </section>
    </GlassCard>
  );
}

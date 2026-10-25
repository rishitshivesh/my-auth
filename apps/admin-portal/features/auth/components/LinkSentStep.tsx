"use client";

import { SentryButton } from "@repo/ui";
import { MailCheck } from "lucide-react";
import { useCopy } from "@/i18n";
import { ResendControl } from "./ResendControl";

export interface LinkSentStepProps {
  title: string;
  description: string;
  hint?: string;
  email: string;
  onResend: () => Promise<void>;
  resendFailure: string;
  backLabel: string;
  onBack: () => void;
}

/** "Check your email" confirmation shared by sign-in links, verification and recovery. */
export function LinkSentStep({ title, description, hint, email, onResend, resendFailure, backLabel, onBack }: LinkSentStepProps) {
  const { t } = useCopy();
  return (
    <div className="space-y-4 text-center" role="status" aria-live="polite">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-success-text">
        <MailCheck aria-hidden="true" className="h-6 w-6" />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="font-body text-sm text-muted-foreground">{description}</p>
      {hint && <p className="font-body text-xs text-muted-foreground">{hint}</p>}
      <ResendControl onResend={onResend} email={email} failureMessage={resendFailure} />
      <SentryButton type="button" variant="ghost" size="sm" className="border-0" onClick={onBack}>
        {backLabel || t("common.actions.back")}
      </SentryButton>
    </div>
  );
}

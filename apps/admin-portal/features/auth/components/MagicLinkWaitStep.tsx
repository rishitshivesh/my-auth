"use client";

import { MailCheck } from "lucide-react";
import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { groupMatchCode, type PollPhase } from "../model/magic-poll";
import { FormAlert } from "./FormAlert";
import { ResendControl } from "./ResendControl";

export interface MagicLinkWaitStepProps {
  email: string;
  matchCode: string;
  phase: PollPhase;
  /** Whole seconds until the link expires. */
  remaining: number;
  onResend: () => Promise<void>;
  onBack: () => void;
}

/** Requesting device: shows the number to type on the other device while polling in the background. */
export function MagicLinkWaitStep({ email, matchCode, phase, remaining, onResend, onBack }: MagicLinkWaitStepProps) {
  const { t } = useCopy();
  const waiting = phase.phase === "waiting";
  const problem =
    phase.phase === "expired"
      ? t("auth.magicLink.expiredNotice")
      : phase.phase === "used"
        ? t("auth.magicLink.usedNotice")
        : phase.phase === "failed"
          ? t("auth.magicLink.pollFailed")
          : undefined;

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-success-text">
        <MailCheck aria-hidden="true" className="h-6 w-6" />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">{t("auth.magicLink.sentTitle")}</h2>
      <p className="font-body text-sm text-muted-foreground">{t("auth.magicLink.sentDescription", { email })}</p>
      <FormAlert message={problem} />
      {waiting && (
        <section aria-labelledby="match-code-heading" className="rounded-sm border border-border bg-muted/30 p-4">
          <h3 id="match-code-heading" className="font-body text-xs uppercase tracking-wide text-muted-foreground">
            {t("auth.magicLink.matchHeading")}
          </h3>
          <p
            data-testid="match-code"
            aria-label={t("auth.magicLink.matchCodeAria", { code: matchCode.split("").join(" ") })}
            className="mt-2 font-mono text-4xl font-semibold tracking-widest text-foreground"
          >
            {groupMatchCode(matchCode)}
          </p>
          <p className="mt-2 font-body text-xs text-muted-foreground">{t("auth.magicLink.matchHint")}</p>
          <p role="status" className="mt-2 font-body text-xs text-muted-foreground">
            {t("auth.magicLink.waiting", { minutes: Math.max(1, Math.ceil(remaining / 60)) })}
          </p>
        </section>
      )}
      <ResendControl onResend={onResend} email={email} failureMessage={t("auth.magicLink.resendFailed")} />
      <SentryButton type="button" variant="ghost" size="sm" className="border-0" onClick={onBack}>
        {t("auth.magicLink.back")}
      </SentryButton>
    </div>
  );
}

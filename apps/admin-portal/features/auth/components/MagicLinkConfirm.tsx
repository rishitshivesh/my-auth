"use client";

import { useState, type FormEvent } from "react";
import { ShieldQuestion } from "lucide-react";
import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { MATCH_CODE_LENGTH } from "@/constants/limits";
import { attemptsLeft } from "../model/magic-landing";
import { describeRequester } from "../model/magic-poll";
import { CodeField } from "./CodeField";
import { FormAlert } from "./FormAlert";
import type { MagicLinkPreview } from "@scrolloop/sdk";

export interface MagicLinkConfirmProps {
  preview: MagicLinkPreview;
  workspace: string;
  pending: boolean;
  entering: boolean;
  attempts: number;
  codeError: boolean;
  onSignInHere: () => void;
  onStartApprove: () => void;
  onCancelApprove: () => void;
  onApprove: (code: string) => void;
  onNotMe: () => void;
}

/** Two deliberate choices; neither runs until pressed. The other-device path needs the displayed code. */
export function MagicLinkConfirm({
  preview,
  workspace,
  pending,
  entering,
  attempts,
  codeError,
  onSignInHere,
  onStartApprove,
  onCancelApprove,
  onApprove,
  onNotMe,
}: MagicLinkConfirmProps) {
  const { t } = useCopy();
  const [code, setCode] = useState("");
  const requester = describeRequester(preview.requestedFrom);
  const crossDevice = preview.requiresMatchCode;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (code.length === MATCH_CODE_LENGTH) {
      onApprove(code);
      setCode("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-success-text">
          <ShieldQuestion aria-hidden="true" className="h-6 w-6" />
        </div>
        <p className="font-body text-sm text-muted-foreground">{t("auth.magicLink.validDescription", { workspace })}</p>
      </div>

      {requester && (
        <dl className="rounded-sm border border-border bg-muted/30 p-3 text-left font-body text-sm" data-testid="magic-requester">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("auth.magicLink.requestedFrom")}</dt>
          <dd className="mt-1 text-foreground">{requester.device || t("auth.magicLink.unknownDevice")}</dd>
          {requester.ip && <dd className="font-mono text-xs text-muted-foreground">{requester.ip}</dd>}
        </dl>
      )}
      {requester && <p className="font-body text-xs text-muted-foreground">{t("auth.magicLink.notYouWarning")}</p>}

      {!entering && (
        <div className="flex flex-col gap-2">
          <SentryButton type="button" variant="accent" className="w-full" onClick={onSignInHere} isLoading={pending}>
            {crossDevice ? t("auth.magicLink.signInHere") : t("auth.magicLink.signIn")}
          </SentryButton>
          {crossDevice && <p className="font-body text-xs text-muted-foreground">{t("auth.magicLink.signInHereNote")}</p>}
          {crossDevice && (
            <SentryButton type="button" variant="outline" className="w-full" onClick={onStartApprove} disabled={pending}>
              {t("auth.magicLink.approveElsewhere")}
            </SentryButton>
          )}
          <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={onNotMe} disabled={pending}>
            {t("auth.magicLink.notMe")}
          </SentryButton>
        </div>
      )}

      {entering && (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={t("auth.magicLink.approveElsewhere")}>
          <p className="font-body text-sm text-muted-foreground">{t("auth.magicLink.codePrompt")}</p>
          <FormAlert message={codeError ? t("auth.magicLink.wrongCode", { count: attemptsLeft(attempts) }) : undefined} />
          <CodeField
            label={t("auth.magicLink.codeLabel")}
            value={code}
            onChange={setCode}
            onComplete={(value) => {
              onApprove(value);
              setCode("");
            }}
            hint={t("auth.magicLink.codeHint", { length: MATCH_CODE_LENGTH })}
            disabled={pending}
            length={MATCH_CODE_LENGTH}
            autoFocus
          />
          <SentryButton type="submit" className="w-full" isLoading={pending} disabled={code.length < MATCH_CODE_LENGTH}>
            {t("auth.magicLink.approve")}
          </SentryButton>
          <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={onCancelApprove} disabled={pending}>
            {t("auth.magicLink.backToChoices")}
          </SentryButton>
        </form>
      )}
    </div>
  );
}

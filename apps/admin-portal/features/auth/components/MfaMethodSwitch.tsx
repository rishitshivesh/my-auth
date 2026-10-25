"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { ChallengeMethod } from "../model/challenge";

const LABEL_KEYS = {
  totp: "auth.mfa.useAuthenticator",
  email: "auth.mfa.useEmail",
  webauthn: "auth.mfa.usePasskey",
  backup: "auth.mfa.useBackupCode",
} as const;

export interface MfaMethodSwitchProps {
  current: ChallengeMethod;
  offered: readonly ChallengeMethod[];
  disabled?: boolean;
  onChoose: (method: ChallengeMethod) => void;
}

/** Other ways to prove the second factor; recovery codes are always the last resort. */
export function MfaMethodSwitch({ current, offered, disabled, onChoose }: MfaMethodSwitchProps) {
  const { t, tk } = useCopy();
  const all: ChallengeMethod[] = [...offered, "backup"];
  const options = all.filter((m) => m !== current);
  if (options.length === 0) return null;
  return (
    <nav aria-label={t("auth.mfa.chooseTitle")} className="flex flex-col gap-1">
      {options.map((method) => (
        <SentryButton key={method} type="button" variant="ghost" size="sm" className="w-full border-0" onClick={() => onChoose(method)} disabled={disabled}>
          {tk(LABEL_KEYS[method])}
        </SentryButton>
      ))}
    </nav>
  );
}

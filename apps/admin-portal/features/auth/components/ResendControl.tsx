"use client";

import { useEffect, useState } from "react";
import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";

export interface ResendControlProps {
  /** Performs the send; throw to signal failure. */
  onResend: () => Promise<void>;
  email?: string;
  failureMessage: string;
  /** Start in cooldown right after the first send happened. */
  startCooling?: boolean;
}

/** Resend with a growing cooldown and polite status announcements. */
export function ResendControl({ onResend, email = "", failureMessage, startCooling = true }: ResendControlProps) {
  const { t } = useCopy();
  const cooldown = useResendCooldown();
  const { start } = cooldown;

  // The email that brought the user here counts as the first send.
  useEffect(() => {
    if (startCooling) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const handle = async (): Promise<void> => {
    setStatus("sending");
    try {
      await onResend();
      setStatus("sent");
      cooldown.start();
    } catch {
      setStatus("failed");
    }
  };

  const disabled = cooldown.isCoolingDown;
  const statusText =
    status === "sent" ? t("auth.resend.sent", { email }) : status === "failed" ? failureMessage : "";

  return (
    <div className="space-y-2 text-center">
      <SentryButton type="button" variant="outline" onClick={handle} disabled={disabled} isLoading={status === "sending"}>
        {disabled ? t("auth.resend.cooldown", { seconds: cooldown.secondsLeft }) : t("auth.resend.action")}
      </SentryButton>
      <p role="status" aria-live="polite" className="font-body text-xs text-muted-foreground">
        {statusText}
      </p>
    </div>
  );
}

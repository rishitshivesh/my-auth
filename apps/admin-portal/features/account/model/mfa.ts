import type { MfaStatus } from "@scrolloop/sdk";
import { RECOVERY_CODES_LOW_THRESHOLD } from "@/constants/limits";

export const METHOD_TOTP = "totp";
export const METHOD_EMAIL = "email";

export interface MfaSummary {
  hasTotp: boolean;
  hasEmailOtp: boolean;
  enabled: boolean;
  backupCodesRemaining: number;
  recoveryState: "unavailable" | "none" | "low" | "ok";
  /** Removing TOTP would leave no authenticator-class second step except email/passkeys. */
  totpIsLastMethod: boolean;
}

export function summarizeMfa(status: MfaStatus, passkeyCount: number): MfaSummary {
  const methods = new Set(status.methods.map((m) => m.toLowerCase()));
  const hasTotp = methods.has(METHOD_TOTP);
  const hasEmailOtp = methods.has(METHOD_EMAIL);
  const remaining = Math.max(0, status.backupCodesRemaining);
  let recoveryState: MfaSummary["recoveryState"] = "ok";
  if (!status.enabled && !hasTotp) recoveryState = "unavailable";
  else if (remaining === 0) recoveryState = "none";
  else if (remaining <= RECOVERY_CODES_LOW_THRESHOLD) recoveryState = "low";
  return {
    hasTotp,
    hasEmailOtp,
    enabled: status.enabled,
    backupCodesRemaining: remaining,
    recoveryState,
    totpIsLastMethod: hasTotp && !hasEmailOtp && passkeyCount === 0,
  };
}

/** Codes shown space-separated so a single copy captures all of them. */
export function formatRecoveryCodes(codes: readonly string[]): string {
  return codes.join("  ");
}

import type { ReauthInput, ReauthRequirements } from "@scrolloop/sdk";
import { OTP_LENGTH } from "@/constants/limits";

/** How the person proves it is them for a sensitive action. */
export type StepUpMode = "password" | "password-totp" | "passkey" | "unsupported";

/** Everything the dialog needs to know about the signed-in user's factors. */
export function stepUpModes(req: ReauthRequirements): { initial: StepUpMode; alternatives: StepUpMode[] } {
  if (!req.mfaEnabled) return { initial: "password", alternatives: [] };
  const modes: StepUpMode[] = [];
  if (req.canUseTotp) modes.push("password-totp");
  if (req.canUsePasskey) modes.push("passkey");
  // MFA is on but only with factors step-up cannot check (e.g. email code): password alone is refused.
  if (modes.length === 0) return { initial: "unsupported", alternatives: [] };
  return { initial: modes[0] as StepUpMode, alternatives: modes.slice(1) };
}

export type StepUpIssue = "password-empty" | "code-incomplete" | null;

export function stepUpIssue(mode: StepUpMode, password: string, code: string): StepUpIssue {
  if ((mode === "password" || mode === "password-totp") && password.length === 0) return "password-empty";
  if (mode === "password-totp" && code.length !== OTP_LENGTH) return "code-incomplete";
  return null;
}

/** Request body for the typed modes; passkey is built from the ceremony instead. */
export function buildReauthInput(mode: "password" | "password-totp", password: string, code: string): ReauthInput {
  return mode === "password-totp" ? { method: "password", password, code } : { method: "password", password };
}

export type StepUpErrorKind = "wrong-password" | "wrong-code" | "rate-limited" | "passkey-cancelled" | "mfa-required" | "generic";

const KIND_BY_CODE: Readonly<Record<string, StepUpErrorKind>> = {
  AUTH_INVALID_CREDENTIALS: "wrong-password",
  AUTH_MFA_INVALID: "wrong-code",
  PASSKEY_INVALID: "wrong-code",
  RATE_LIMITED: "rate-limited",
  AUTH_ACCOUNT_LOCKED: "rate-limited",
  PASSKEY_AUTH_CANCELLED: "passkey-cancelled",
  AUTH_MFA_REQUIRED: "mfa-required",
};

export function stepUpErrorKind(error: unknown): StepUpErrorKind {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return KIND_BY_CODE[code] ?? "generic";
}

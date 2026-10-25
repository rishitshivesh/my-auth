const RECENT_AUTH_CODE = "ACCESS_RECENT_AUTH_REQUIRED";
const PASSKEY_CANCEL_CODES: ReadonlySet<string> = new Set(["PASSKEY_REGISTRATION_CANCELLED", "PASSKEY_AUTH_CANCELLED"]);
const PASSKEY_UNSUPPORTED_CODE = "PASSKEY_NOT_SUPPORTED";

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error as { code: unknown };
  return typeof code === "string" ? code : undefined;
}

/** The server wants a fresh sign-in before this sensitive action. */
export function isRecentAuthError(error: unknown): boolean {
  return errorCode(error) === RECENT_AUTH_CODE;
}

export type PasskeyFailure = "cancelled" | "unsupported" | "failed";

/** Classify a passkey ceremony failure so the UI can say the right thing. */
export function classifyPasskeyError(error: unknown): PasskeyFailure {
  const code = errorCode(error);
  if (code !== undefined && PASSKEY_CANCEL_CODES.has(code)) return "cancelled";
  if (code === PASSKEY_UNSUPPORTED_CODE) return "unsupported";
  return "failed";
}

import type { ErrorCode } from "@scrolloop/types";
import { en } from "@/i18n/en";

/**
 * Friendly copy for API error codes now lives in `i18n/en/errors.ts`. This
 * module keeps the classification sets that drive behaviour.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = en.errors;

/** Codes whose friendly copy beats whatever generic detail the server sends. */
export const PREFER_FRIENDLY_COPY: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "RATE_LIMITED",
  "ACCESS_RECENT_AUTH_REQUIRED",
  "AUTH_ACCOUNT_LOCKED",
  "INTERNAL_ERROR",
]);

/** Codes meaning the session itself is gone, so the user must sign in again. */
export const SESSION_ENDED_CODES: ReadonlySet<string> = new Set([
  "AUTH_TOKEN_INVALID",
  "AUTH_TOKEN_EXPIRED",
  "AUTH_SESSION_REVOKED",
  "AUTH_REFRESH_REUSED",
]);

export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
}

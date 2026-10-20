import { SentryApiError } from "@scrolloop/sdk";
import {
  ERROR_MESSAGES,
  PREFER_FRIENDLY_COPY,
  isKnownErrorCode,
} from "./error-messages";

export { SentryApiError };

export interface ApiErrorView {
  /** Primary user-facing sentence. */
  message: string;
  /** Small secondary line, e.g. the support reference. */
  reference?: string;
  /** Field-level messages keyed by field path (VALIDATION_FAILED). */
  fieldErrors: Record<string, string>;
}

/** Field errors as a { field: message } map (first message wins). */
export function fieldErrorMap(err: unknown): Record<string, string> {
  if (!(err instanceof SentryApiError)) return {};
  const out: Record<string, string> = {};
  for (const fe of err.fieldErrors) {
    if (!(fe.field in out)) out[fe.field] = fe.message;
  }
  return out;
}

function retryText(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Build the display model for any thrown value. */
export function describeError(err: unknown, fallback = "An unexpected error occurred"): ApiErrorView {
  if (!(err instanceof SentryApiError)) {
    return {
      message: err instanceof Error && err.message ? err.message : fallback,
      fieldErrors: {},
    };
  }

  const known = isKnownErrorCode(err.code) ? err.code : undefined;
  const friendly = known ? ERROR_MESSAGES[known] : undefined;

  let message = err.detail ?? err.title;
  if (known && friendly && (PREFER_FRIENDLY_COPY.has(known) || !err.detail)) {
    message = friendly;
  }
  if (known === "RATE_LIMITED" && err.retryAfterSeconds) {
    message = `${message} Try again in ${retryText(err.retryAfterSeconds)}.`;
  }
  if (known === "AUTH_ACCOUNT_LOCKED" && err.retryAfterSeconds) {
    message = `${message} Try again in ${retryText(err.retryAfterSeconds)}.`;
  }

  const fieldErrors = fieldErrorMap(err);
  if (known === "VALIDATION_FAILED") {
    const lines = err.fieldErrors.map((f) => `${f.field}: ${f.message}`);
    if (lines.length > 0) message = lines.join("; ");
  }

  return {
    message,
    reference: err.requestId ? `Reference: ${err.requestId}` : undefined,
    fieldErrors,
  };
}

/** One-line message for inline error state. */
export function getErrorMessage(err: unknown, fallback?: string): string {
  return describeError(err, fallback).message;
}

/** What a failed auth call means for the UI. Messages come from copy, never the server text. */
export type FailureKind =
  | "invalid-credentials"
  | "locked"
  | "rate-limited"
  | "email-unverified"
  | "suspended"
  | "provider-disabled"
  | "invalid-code"
  | "policy"
  | "passkey-cancelled"
  | "passkey-unsupported"
  | "generic";

export interface Failure {
  kind: FailureKind;
  retryAfterSeconds?: number;
  /** Support reference, shown small. */
  requestId?: string;
  /** Per-field server messages (VALIDATION_FAILED / PASSWORD_POLICY). */
  fieldErrors: Record<string, string>;
}

const CODE_TO_KIND: Readonly<Record<string, FailureKind>> = {
  AUTH_INVALID_CREDENTIALS: "invalid-credentials",
  AUTH_ACCOUNT_LOCKED: "locked",
  RATE_LIMITED: "rate-limited",
  AUTH_EMAIL_NOT_VERIFIED: "email-unverified",
  USER_SUSPENDED: "suspended",
  TENANT_SUSPENDED: "suspended",
  SOCIAL_PROVIDER_DISABLED: "provider-disabled",
  AUTH_MFA_INVALID: "invalid-code",
  AUTH_OTP_INVALID: "invalid-code",
  PASSWORD_POLICY: "policy",
  PASSKEY_AUTH_CANCELLED: "passkey-cancelled",
  PASSKEY_REGISTRATION_CANCELLED: "passkey-cancelled",
  PASSKEY_NOT_SUPPORTED: "passkey-unsupported",
};

interface ApiErrorShape {
  code?: unknown;
  retryAfterSeconds?: unknown;
  requestId?: unknown;
  fieldErrors?: unknown;
}

const asRecord = (error: unknown): ApiErrorShape => (typeof error === "object" && error !== null ? (error as ApiErrorShape) : {});

/** Duck-typed on purpose: keeps model/ free of SDK runtime imports. */
export function describeFailure(error: unknown): Failure {
  const shape = asRecord(error);
  const kind = CODE_TO_KIND[typeof shape.code === "string" ? shape.code : ""] ?? "generic";
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(shape.fieldErrors)) {
    for (const item of shape.fieldErrors as Array<{ field?: unknown; message?: unknown }>) {
      if (typeof item?.field === "string" && typeof item.message === "string" && !(item.field in fieldErrors)) {
        fieldErrors[item.field] = item.message;
      }
    }
  }
  return {
    kind,
    retryAfterSeconds: typeof shape.retryAfterSeconds === "number" ? shape.retryAfterSeconds : undefined,
    requestId: typeof shape.requestId === "string" ? shape.requestId : undefined,
    fieldErrors,
  };
}

export interface WaitParts {
  unit: "seconds" | "minutes";
  value: number;
}

export function waitParts(seconds: number): WaitParts {
  if (seconds < 60) return { unit: "seconds", value: Math.max(1, Math.ceil(seconds)) };
  return { unit: "minutes", value: Math.ceil(seconds / 60) };
}

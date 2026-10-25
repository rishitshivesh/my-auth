// Stable machine codes mapped to their HTTP status. Clients (admin-portal, SDKs)
// map `code` to screens and messages, so renaming a code is a breaking change.
export const ERROR_STATUS = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_EMAIL_NOT_VERIFIED: 403,
  AUTH_MFA_REQUIRED: 401,
  AUTH_MFA_INVALID: 401,
  AUTH_OTP_INVALID: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_SESSION_REVOKED: 401,
  AUTH_REFRESH_REUSED: 401,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_PASSWORD_EXPIRED: 403,
  // Authorization
  ACCESS_FORBIDDEN: 403,
  ACCESS_RECENT_AUTH_REQUIRED: 403,
  HIERARCHY_VIOLATION: 403,
  TENANT_MISMATCH: 403,
  TENANT_SUSPENDED: 403,
  USER_SUSPENDED: 403,
  // Resources
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_CONFLICT: 409,
  TENANT_NOT_FOUND: 404,
  LAST_OWNER: 409,
  INVITE_INVALID: 400,
  // Credentials and factors
  PASSWORD_POLICY: 422,
  MFA_ALREADY_ENABLED: 409,
  MFA_NOT_ENABLED: 409,
  MFA_NOT_STARTED: 409,
  PASSKEY_INVALID: 401,
  PASSKEY_LIMIT: 409,
  SOCIAL_PROVIDER_DISABLED: 404,
  SOCIAL_PROVIDER_ERROR: 502,
  // Generic
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UPLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface FieldError {
  /** Dotted path of the field, e.g. "email". */
  field: string;
  message: string;
}

/** RFC 9457 problem details, sent as application/problem+json. */
export interface ProblemDetails {
  type: string; // urn:scrolloop:problem:<CODE>
  title: string;
  status: number;
  code: ErrorCode;
  /** Safe to show a user. Never reveals whether an account exists. */
  detail?: string;
  /** Quote this when reporting a problem; also in the x-request-id header. */
  requestId: string;
  /** Only on VALIDATION_FAILED. */
  errors?: FieldError[];
  /** Only on RATE_LIMITED; mirrors the Retry-After header. */
  retryAfterSeconds?: number;
}

export const PROBLEM_TYPE_PREFIX = "urn:scrolloop:problem:";

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_STATUS, value);
}

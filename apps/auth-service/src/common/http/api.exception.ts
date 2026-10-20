import { HttpException } from "@nestjs/common";
import { ERROR_STATUS, type ErrorCode, type FieldError } from "@scrolloop/types";

export interface ApiExceptionOptions {
  /** Safe to show a user. Never reveal whether an email exists or why a token was rejected. */
  detail?: string;
  /** Only for VALIDATION_FAILED. */
  errors?: FieldError[];
  /** Only for RATE_LIMITED. */
  retryAfterSeconds?: number;
}

/**
 * The one way to fail a request. The code fixes the HTTP status;
 * ProblemDetailsFilter turns it into RFC 9457 JSON.
 */
export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly errors: FieldError[] | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ErrorCode, options: ApiExceptionOptions = {}) {
    super(code, ERROR_STATUS[code]);
    this.code = code;
    this.detail = options.detail;
    this.errors = options.errors;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * For standards-defined endpoints (OAuth 2.0 RFC 6749, SCIM RFC 7644, SAML)
 * whose clients require their own error body. The filter sends `body` as-is.
 */
export class ProtocolException extends HttpException {
  constructor(
    status: number,
    readonly body: Record<string, unknown>,
    /** e.g. WWW-Authenticate on 401 (RFC 6749 5.2). */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(body, status);
  }
}

/** True for an ApiException carrying RESOURCE_CONFLICT (e.g. "already exists"). */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiException && error.code === "RESOURCE_CONFLICT";
}

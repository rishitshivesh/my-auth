/**
 * Scrolloop Sentry SDK - API errors
 *
 * The API answers every failure with RFC 9457 `application/problem+json`.
 * SentryApiError parses that shape and degrades gracefully for the legacy
 * `{ statusCode, message }` / `{ error: { code, message } }` bodies and for
 * non-JSON responses (proxies, gateways).
 */

import type { ErrorCode, FieldError } from '@scrolloop/types';
import { AuthError } from './types';

export interface ApiErrorInit {
  code: ErrorCode | string;
  status: number;
  title: string;
  detail?: string;
  requestId?: string;
  fieldErrors?: FieldError[];
  retryAfterSeconds?: number;
  body?: unknown;
}

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

function parseFieldErrors(raw: unknown): FieldError[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FieldError[] = [];
  for (const item of raw) {
    if (isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string') {
      out.push({ field: item.field, message: item.message });
    }
  }
  return out.length > 0 ? out : undefined;
}

function statusFallbackCode(status: number): string {
  if (status === 401) return 'AUTH_TOKEN_INVALID';
  if (status === 403) return 'ACCESS_FORBIDDEN';
  if (status === 404) return 'RESOURCE_NOT_FOUND';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
}

export class SentryApiError extends AuthError {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly fieldErrors: FieldError[];
  readonly retryAfterSeconds?: number;
  /** Raw response body, for callers that need protocol-specific fields. */
  readonly body?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.code as ErrorCode, init.detail ?? init.title, init.body);
    this.name = 'SentryApiError';
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.body = init.body;
    Object.setPrototypeOf(this, SentryApiError.prototype);
  }

  /**
   * Build from an HTTP response. Never throws; always yields a usable error.
   */
  static fromResponse(response: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: unknown;
  }): SentryApiError {
    const { status, data } = response;
    const headerRequestId = response.headers?.['x-request-id'];
    const retryHeader = Number(response.headers?.['retry-after']);
    const retryFromHeader = Number.isFinite(retryHeader) ? retryHeader : undefined;
    const fallbackTitle = response.statusText || 'Request failed';

    if (isRecord(data)) {
      // RFC 9457 problem details (current shape)
      if (typeof data.code === 'string' && typeof data.title === 'string') {
        return new SentryApiError({
          code: data.code,
          status: typeof data.status === 'number' ? data.status : status,
          title: data.title,
          detail: str(data.detail),
          requestId: str(data.requestId) ?? headerRequestId,
          fieldErrors: parseFieldErrors(data.errors),
          retryAfterSeconds:
            typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : retryFromHeader,
          body: data,
        });
      }

      // Legacy envelope: { error: { code, message, requestId } }
      if (isRecord(data.error)) {
        return new SentryApiError({
          code: str(data.error.code) ?? statusFallbackCode(status),
          status,
          title: fallbackTitle,
          detail: str(data.error.message),
          requestId: str(data.error.requestId) ?? headerRequestId,
          retryAfterSeconds: retryFromHeader,
          body: data,
        });
      }

      // Legacy Nest default: { statusCode, message: string | string[], error? }
      const rawMessage = data.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.filter((m): m is string => typeof m === 'string').join('; ')
        : str(rawMessage);
      return new SentryApiError({
        code: str(data.code) ?? statusFallbackCode(status),
        status,
        title: str(data.error) ?? fallbackTitle,
        detail: message || undefined,
        requestId: headerRequestId,
        retryAfterSeconds: retryFromHeader,
        body: data,
      });
    }

    // Non-JSON body (plain text from a proxy, empty body)
    return new SentryApiError({
      code: statusFallbackCode(status),
      status,
      title: fallbackTitle,
      detail: str(data)?.slice(0, 300),
      requestId: headerRequestId,
      retryAfterSeconds: retryFromHeader,
      body: data,
    });
  }
}

export function isSentryApiError(value: unknown): value is SentryApiError {
  return value instanceof SentryApiError;
}

export type LinkFailure = 'expired' | 'already_used' | 'wrong_account';

/**
 * Classify a failed email-link action (verify-email, magic link, reset, invite).
 * Returns undefined for any other error so callers can fall through.
 */
export function linkFailureReason(value: unknown): LinkFailure | undefined {
  if (!isSentryApiError(value)) return undefined;
  switch (value.code) {
    case 'LINK_EXPIRED':
      return 'expired';
    case 'LINK_ALREADY_USED':
      return 'already_used';
    case 'LINK_WRONG_ACCOUNT':
      return 'wrong_account';
    default:
      return undefined;
  }
}

export const isLinkExpired = (v: unknown): boolean => linkFailureReason(v) === 'expired';
export const isLinkAlreadyUsed = (v: unknown): boolean => linkFailureReason(v) === 'already_used';
export const isLinkWrongAccount = (v: unknown): boolean => linkFailureReason(v) === 'wrong_account';

/**
 * SDK feature modules - shared context and helpers.
 *
 * Each module (account, mfa, sessions, ...) is a small factory that receives a
 * ModuleContext from SentryClient. Modules never hold state of their own, so a
 * client per tenant (see docs: no singletons) gives each tenant its own set.
 */

import type { SessionClaims, TransportRequest, TransportResponse } from "../types";
import { AuthError } from "../types";

export interface ModuleContext {
  baseURL: string;
  /** Authenticated request: cookies + one silent refresh/retry on 401. */
  request(req: TransportRequest): Promise<TransportResponse>;
  /** Pre-session request: tenant header + cookies, no refresh logic. */
  publicRequest(req: TransportRequest): Promise<TransportResponse>;
  /** Turn a non-ok response into a SentryApiError (also emits the error event). */
  fail(response: TransportResponse): AuthError;
  /** Record a newly established session (login, MFA, magic link, passkey). */
  sessionEstablished(expiresIn?: number, session?: SessionClaims): void;
  /** Drop local session state (after revoke-all / account deletion). */
  endLocalSession(): void;
  log(...args: unknown[]): void;
}

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Max envelope layers to strip. A few endpoints wrap `{status,data}` by hand on top of the interceptor. */
const MAX_ENVELOPE_DEPTH = 2;

/**
 * The API wraps successes as `{ status: number, data }`, except raw-response
 * endpoints (magic-link verify, passkey login finish, OAuth consent) which
 * return the payload as-is. A numeric `status` plus a `data` key is the
 * envelope; branch payloads use a *string* `status` ("mfa_enrollment_required")
 * and are never mistaken for one.
 */
export function unwrapEnvelope(body: unknown): unknown {
  let current = body;
  for (let depth = 0; depth < MAX_ENVELOPE_DEPTH; depth++) {
    if (isRecord(current) && typeof current.status === "number" && "data" in current) {
      current = current.data;
    } else {
      break;
    }
  }
  return current;
}

/** Unwrap and assert the payload is an object. */
export function payloadOf(response: TransportResponse): Rec {
  const payload = unwrapEnvelope(response.data);
  return isRecord(payload) ? payload : {};
}

/** Send a request and return the unwrapped payload typed as T. Throws SentryApiError on non-2xx. */
export async function call<T>(
  ctx: ModuleContext,
  req: TransportRequest,
  options: { auth?: boolean } = {},
): Promise<T> {
  const auth = options.auth ?? true;
  const response = await (auth ? ctx.request(req) : ctx.publicRequest(req));
  if (!response.ok) throw ctx.fail(response);
  return unwrapEnvelope(response.data) as T;
}

/** Like call() but for endpoints whose result the caller ignores. */
export async function callVoid(
  ctx: ModuleContext,
  req: TransportRequest,
  options: { auth?: boolean } = {},
): Promise<void> {
  await call<unknown>(ctx, req, options);
}

export const enc = (segment: string): string => encodeURIComponent(segment);

/** Recent-auth failure: the user must sign in again before this action. */
export function isRecentAuthRequired(error: unknown): boolean {
  return error instanceof AuthError && error.code === "ACCESS_RECENT_AUTH_REQUIRED";
}

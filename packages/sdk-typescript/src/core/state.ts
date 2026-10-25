/**
 * Scrolloop Sentry SDK - State Manager
 *
 * Manages the in-memory auth state
 * Never persisted, never exposed
 */

import type { AuthState, PendingRequest, SessionClaims } from './types';

/**
 * Creates a new auth state
 * All state lives in memory only
 */
export function createAuthState(): AuthState {
  return {
    authenticated: false,
    expiresAt: undefined,
    session: undefined,
    isRefreshing: false,
    refreshPromise: undefined,
    pendingRequests: [],
  };
}

// The SDK never holds the access token itself — it lives only in an httpOnly
// cookie the browser cannot read. `authenticated` reflects the outcome of the
// last login/refresh/getCurrentUser call, not possession of a credential.

/**
 * Mark the session established (or renewed) after a successful
 * login/refresh/verify call.
 *
 * @param expiresInSeconds - TTL the server reported for the access token it
 *   just issued, used only to schedule a proactive refresh ahead of expiry.
 */
export function markAuthenticated(
  state: AuthState,
  expiresInSeconds?: number,
  session?: SessionClaims,
): void {
  state.authenticated = true;
  state.expiresAt = expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : undefined;
  if (session) state.session = session;
}

/**
 * Clear local session state (logout, or refresh failed for good)
 */
export function clearAuthentication(state: AuthState): void {
  state.authenticated = false;
  state.expiresAt = undefined;
  state.session = undefined;
}

/**
 * Is the session expiring soon enough that we should proactively refresh?
 * Returns false (not expiring) when the server didn't report an expiry —
 * the reactive 401-retry path still covers that case.
 *
 * @param margin - Seconds before expiry to treat as "expiring soon" (default: 30)
 */
export function isSessionExpiringSoon(state: AuthState, margin: number = 30): boolean {
  if (!state.authenticated) return true;
  if (!state.expiresAt) return false;

  const expiryWithMargin = state.expiresAt - margin * 1000;
  return Date.now() >= expiryWithMargin;
}

/**
 * Add request to pending queue
 */
export function queueRequest(
  state: AuthState,
  request: PendingRequest,
): void {
  state.pendingRequests.push(request);
}

/**
 * Process all pending requests
 */
export function flushPendingRequests(
  state: AuthState,
  handler: (request: PendingRequest) => void,
): void {
  const requests = [...state.pendingRequests];
  state.pendingRequests = [];

  requests.forEach(handler);
}

/**
 * Reject all pending requests
 */
export function rejectPendingRequests(
  state: AuthState,
  error: unknown,
): void {
  const requests = [...state.pendingRequests];
  state.pendingRequests = [];

  requests.forEach((req) => req.reject(error));
}

/**
 * Fort Knox SDK - State Manager
 * 
 * Manages the in-memory auth state
 * Never persisted, never exposed
 */

import type { AuthState, PendingRequest } from './types';

/**
 * Creates a new auth state
 * All state lives in memory only
 */
export function createAuthState(): AuthState {
  return {
    accessToken: undefined,
    accessTokenExp: undefined,
    isRefreshing: false,
    refreshPromise: undefined,
    pendingRequests: [],
  };
}

// Access token is intentionally stored in module memory only.
// It is never written to localStorage, sessionStorage, or any
// JS-accessible cookie. Loss of the token on page refresh is
// intentional — the httpOnly refresh token cookie is used to
// silently re-issue a new access token via getAccessToken().

/**
 * Set access token and parse expiration
 */
export function setAccessToken(state: AuthState, token: string): void {
  state.accessToken = token;
  state.accessTokenExp = parseTokenExpiry(token);
}

/**
 * Clear access token
 */
export function clearAccessToken(state: AuthState): void {
  state.accessToken = undefined;
  state.accessTokenExp = undefined;
}

/**
 * Check if token is expired or about to expire
 * @param margin - Seconds before expiry to consider token expired (default: 30)
 */
export function isTokenExpired(state: AuthState, margin: number = 30): boolean {
  if (!state.accessToken || !state.accessTokenExp) {
    return true;
  }

  const now = Date.now();
  const expiryWithMargin = state.accessTokenExp - (margin * 1000);
  
  return now >= expiryWithMargin;
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
  error: any,
): void {
  const requests = [...state.pendingRequests];
  state.pendingRequests = [];
  
  requests.forEach((req) => req.reject(error));
}

/**
 * Parse JWT to get expiration timestamp
 */
function parseTokenExpiry(token: string): number | undefined {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;

    // Decode payload (base64url)
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    
    // exp is in seconds, convert to milliseconds
    return payload.exp ? payload.exp * 1000 : undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Fort Knox SDK - Core Types
 *
 * These types are used across all adapters (web, node, next, react).
 * Shared base types (User, Session, SecurityEventType, and UI types) live in
 * @fortknox/types and are re-exported here so SDK consumers need only one import.
 */

// Re-export shared types so internal SDK modules can import from './types'
// and external consumers can import from '@fortknox/sdk' without knowing about @fortknox/types.
export type { User, Session, SecurityEventType } from '@fortknox/types';

// ============================================================
// TRANSPORT ABSTRACTION
// ============================================================

/**
 * Transport is the interface for making HTTP requests
 * This allows the SDK to work in any environment (browser, Node, Next.js)
 */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export interface TransportRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: any;
  credentials?: 'include' | 'omit' | 'same-origin';
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
}

// ============================================================
// RUNTIME STATE
// ============================================================

/**
 * Internal state of the auth session
 * Lives in memory, never persisted
 */
export interface AuthState {
  /** Current access token (JWT) */
  accessToken?: string;
  
  /** Access token expiration timestamp (ms) */
  accessTokenExp?: number;
  
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  
  /** Promise for ongoing refresh (for deduplication) */
  refreshPromise?: Promise<void>;
  
  /** Queued requests during refresh */
  pendingRequests: Array<PendingRequest>;
}

export interface PendingRequest {
  request: TransportRequest;
  resolve: (response: TransportResponse) => void;
  reject: (error: any) => void;
}

// ============================================================
// CLIENT CONFIGURATION
// ============================================================

export interface FortKnoxConfig {
  /** Base URL of the auth service */
  baseURL: string;
  
  /** Tenant ID or slug */
  tenant: string;
  
  /** Custom transport (default: fetch) */
  transport?: Transport;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Token refresh margin in seconds (default: 30) */
  refreshMargin?: number;
  
  /** Maximum refresh retry attempts (default: 3) */
  maxRefreshRetries?: number;
  
  /** Event listeners */
  onTokenRefreshed?: (accessToken: string) => void;
  onLogout?: () => void;
  onError?: (error: AuthError) => void;
}

// ============================================================
// AUTHENTICATION
// ============================================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
  mfaRequired?: boolean;
  mfaChallenge?: MfaChallenge;
}

export interface LoginIntentResponse {
  exists: boolean,
  email: string,
  methods: {
    password: boolean,
    magicLink: boolean,
    passkey: boolean,
    mfa: boolean,
    social: string[]
  },
  preferredMethod: string[],
  branding: {
    logo: string,
    primaryColor: string,
    companyName: string
  }
}


export interface MfaChallenge {
  tempToken: string;
  methods: ('totp' | 'sms' | 'webauthn')[];
  remainingAttempts?: number;
}

// ============================================================
// ERRORS
// ============================================================

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID_CODE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'REFRESH_FAILED'
  | 'REFRESH_TOKEN_REUSE'
  | 'WEBAUTHN_CHALLENGE_EXPIRED'
  | 'WEBAUTHN_REPLAY_DETECTED'
  | 'PASSKEY_NOT_SUPPORTED'
  | 'PASSKEY_REGISTRATION_CANCELLED'
  | 'PASSKEY_AUTH_CANCELLED'
  | 'UNKNOWN_ERROR';

// ============================================================
// EVENTS
// ============================================================

export type AuthEvent = 
  | { type: 'token_refreshed'; accessToken: string }
  | { type: 'logout' }
  | { type: 'error'; error: AuthError }
  | { type: 'session_expired' };

export type AuthEventListener = (event: AuthEvent) => void;

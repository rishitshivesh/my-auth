/**
 * Scrolloop Sentry SDK - Core Types
 *
 * These types are used across all adapters (web, node, next, react).
 * Shared base types (User, Session, SecurityEventType, and UI types) live in
 * @scrolloop/types and are re-exported here so SDK consumers need only one import.
 */

// Re-export shared types so internal SDK modules can import from './types'
// and external consumers can import from '@scrolloop/sdk' without knowing about @scrolloop/types.
// export type { User, Session, SecurityEventType } from '@scrolloop/types';

// ============================================================
// TRANSPORT ABSTRACTION
// ============================================================

/**
 * Transport is the interface for making HTTP requests
 * This allows the SDK to work in any environment (browser, Node, Next.js)
 */
export type Transport = (
  request: TransportRequest,
) => Promise<TransportResponse>;

export interface TransportRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  headers?: Record<string, string>;
  body?: any;
  credentials?: "include" | "omit" | "same-origin";
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

export interface SentryConfig {
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
  exists: boolean;
  email: string;
  methods: {
    password: boolean;
    magicLink: boolean;
    passkey: boolean;
    mfa: boolean;
    social: string[];
  };
  preferredMethod: "password" | "magicLink" | "passkey";
  branding: {
    logo: string;
    primaryColor: string;
    companyName: string;
  };
}

export interface PasskeyChallengeResponse {
  sessionNonce: string;
  [key: string]: unknown;
}

export interface MfaChallenge {
  tempToken: string;
  methods: ("totp" | "sms" | "webauthn")[];
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
    this.name = "AuthError";
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "MFA_REQUIRED"
  | "MFA_INVALID_CODE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMIT_EXCEEDED"
  | "NETWORK_ERROR"
  | "REFRESH_FAILED"
  | "REFRESH_TOKEN_REUSE"
  | "WEBAUTHN_CHALLENGE_EXPIRED"
  | "WEBAUTHN_REPLAY_DETECTED"
  | "PASSKEY_NOT_SUPPORTED"
  | "PASSKEY_REGISTRATION_CANCELLED"
  | "PASSKEY_AUTH_CANCELLED"
  | "UNKNOWN_ERROR";

// ============================================================
// EVENTS
// ============================================================

export type AuthEvent =
  | { type: "token_refreshed"; accessToken: string }
  | { type: "logout" }
  | { type: "error"; error: AuthError }
  | { type: "session_expired" };

export type AuthEventListener = (event: AuthEvent) => void;

/**
 * Scrolloop Sentry Types
 *
 * Shared types consumed by both the Scrolloop Sentry SDK and backend services.
 * SDK-specific types (AuthState, SentryConfig, AuthError, etc.) live in @scrolloop/sdk.
 */

// ============================================================
// USER & SESSION — base shapes shared across SDK and backend
// ============================================================

export interface User {
  id: string;
  tenantId: string;
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  primaryAuthMethod: "password" | "google" | "github" | "microsoft";
  mfaEnabled: boolean;
  status: "active" | "suspended" | "deleted";
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  deviceInfo?: {
    userAgent?: string;
    browser?: string;
    os?: string;
    device?: string;
  };
  ipAddress?: string;
  location?: {
    city?: string;
    country?: string;
  };
  current: boolean;
  expiresAt: Date;
  lastActivityAt: Date;
  createdAt: Date;
}

// ============================================================
// SECURITY EVENTS — single source of truth for event taxonomy
// ============================================================

export const SecurityEventType = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  TOKEN_REFRESHED: "TOKEN_REFRESHED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",
  MFA_VERIFIED: "MFA_VERIFIED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  PASSKEY_REGISTERED: "PASSKEY_REGISTERED",
  PASSKEY_REMOVED: "PASSKEY_REMOVED",
  PASSKEY_AUTH_SUCCESS: "PASSKEY_AUTH_SUCCESS",
  SOCIAL_ACCOUNT_LINKED: "SOCIAL_ACCOUNT_LINKED",
  SOCIAL_ACCOUNT_UNLINKED: "SOCIAL_ACCOUNT_UNLINKED",
  SUSPICIOUS_ACTIVITY: "SUSPICIOUS_ACTIVITY",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
} as const;

export type SecurityEventType =
  (typeof SecurityEventType)[keyof typeof SecurityEventType];

// ============================================================
// TENANT & APPLICATION — multi-tenant management types
// ============================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "suspended";
  createdAt: string; // ISO 8601
}

export interface Application {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  environment: "production" | "staging" | "test";
  loginUri: string;
  callbackUrls: string[];
  logoutUrls: string[];
  createdAt: string;
}

// ============================================================
// API KEYS
// ============================================================

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string; // e.g. "fk_live_••••abcd" — never the full key
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// ============================================================
// PASSKEY CREDENTIALS — client-safe shape (no server-only fields)
// ============================================================

export interface PasskeyCredential {
  id: string;
  userId: string;
  deviceName: string | null;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
  // credentialId and publicKey are intentionally absent — server-only
}

// ============================================================
// TENANT BRANDING
// ============================================================

export interface TenantBranding {
  tenantId: string;
  primaryColor: string; // hex e.g. "#3c83f6"
  logoUrl: string | null;
  fontFamily: string;
  headerWeight: "regular" | "bold";
  backgroundStyle: "solid" | "gradient";
}

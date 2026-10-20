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
  primaryAuthMethod: 'password' | 'google' | 'github' | 'microsoft';
  mfaEnabled: boolean;
  status: 'active' | 'suspended' | 'deleted';
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
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_VERIFIED: 'MFA_VERIFIED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  PASSKEY_REGISTERED: 'PASSKEY_REGISTERED',
  PASSKEY_REMOVED: 'PASSKEY_REMOVED',
  PASSKEY_AUTH_SUCCESS: 'PASSKEY_AUTH_SUCCESS',
  SOCIAL_ACCOUNT_LINKED: 'SOCIAL_ACCOUNT_LINKED',
  SOCIAL_ACCOUNT_UNLINKED: 'SOCIAL_ACCOUNT_UNLINKED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
} as const;

export type SecurityEventType = typeof SecurityEventType[keyof typeof SecurityEventType];

// ============================================================
// TENANT & APPLICATION — multi-tenant management types
// ============================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  createdAt: string; // ISO 8601
}

export interface Application {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  environment: 'production' | 'staging' | 'test';
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
  headerWeight: 'regular' | 'bold';
  backgroundStyle: 'solid' | 'gradient';
}
export * from "./errors";

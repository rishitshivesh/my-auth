/**
 * Scrolloop Sentry SDK - API payload types
 *
 * Shapes of the request/response bodies of the auth-service endpoints the SDK
 * wraps. Derived from the controllers/DTOs in apps/auth-service. Every flow
 * with more than one outcome is a discriminated union so callers must handle
 * each branch (MFA challenge, MFA enrollment, established session).
 */

import type { SessionClaims } from "./types";

// ============================================================
// LOGIN-LIKE RESULTS
// ============================================================

export type MfaMethod = "totp" | "sms" | "webauthn" | "email";

/** Minimal user summary returned by password / passkey login. */
export interface LoginUser {
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
}

/** A session is now live (cookies set by the server). */
export interface SessionEstablished {
  mfaRequired?: false;
  status?: undefined;
  expiresIn: number;
  tenantSlug: string;
  session?: SessionClaims;
  user?: LoginUser;
  /** Present on backup-code logins: how many codes are left. */
  warning?: string;
}

/** A second factor is required before a session exists. */
export interface MfaChallengeResult {
  mfaRequired: true;
  status?: undefined;
  mfaChallenge: {
    tempToken: string;
    methods: MfaMethod[];
    preferredMethod?: string;
    remainingAttempts?: number;
  };
}

/**
 * Tenant policy requires the user to enrol an MFA factor before a session is
 * issued. Password login returns `enrollmentToken` in the body; magic-link and
 * passkey login deliver it only as an httpOnly cookie (token is then absent).
 */
export interface MfaEnrollmentRequiredResult {
  mfaRequired?: false;
  status: "mfa_enrollment_required";
  enrollmentToken?: string;
}

/** Result of every flow that can end in a session: login, magic link, passkey. */
export type AuthOutcome =
  | SessionEstablished
  | MfaChallengeResult
  | MfaEnrollmentRequiredResult;

/** Result of completing an MFA challenge: only a session can come back. */
export type MfaLoginOutcome = SessionEstablished;

export const isMfaChallenge = (o: AuthOutcome): o is MfaChallengeResult =>
  o.mfaRequired === true;

export const isMfaEnrollmentRequired = (
  o: AuthOutcome,
): o is MfaEnrollmentRequiredResult => o.status === "mfa_enrollment_required";

export const isSessionEstablished = (o: AuthOutcome): o is SessionEstablished =>
  o.mfaRequired !== true && o.status !== "mfa_enrollment_required";

// ============================================================
// REGISTRATION / EMAIL
// ============================================================

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Registration deliberately answers the same way whether or not the email is
 * already taken (no account enumeration). The user must verify by email.
 */
export interface RegisterResult {
  message?: string;
  [key: string]: unknown;
}

export interface MessageResult {
  message: string;
}

// ============================================================
// PROVIDERS / INTENT
// ============================================================

export interface SocialProviderInfo {
  provider: string;
  enabled: boolean;
  displayName?: string;
}

export interface AuthProviders {
  password: boolean;
  magicLink: boolean;
  passkey: boolean;
  social: SocialProviderInfo[];
}

// ============================================================
// MFA MANAGEMENT
// ============================================================

export interface MfaStatus {
  enabled: boolean;
  methods: string[];
  preferredMethod?: string;
  backupCodesRemaining: number;
}

export interface TotpSetup {
  secret: string;
  /** QR code as a data URL. */
  qrCode: string;
  backupCodes: string[];
}

export interface TotpEnabled {
  message: string;
  backupCodes: string[];
}

export interface BackupCodes {
  backupCodes: string[];
  count: number;
}

export interface Passkey {
  id: string;
  deviceName?: string;
  createdAt: string;
  lastUsedAt?: string;
  transports: string[];
}

/**
 * WebAuthn JSON payloads are owned by the browser library; the SDK only
 * relays them. Structural types so @simplewebauthn/browser's own types fit.
 */
export type WebAuthnOptionsJSON = { challenge: string } & Record<string, unknown>;
export type WebAuthnCredentialJSON = object;

export interface PasskeyLoginStart extends WebAuthnOptionsJSON {
  sessionNonce: string;
}

// ============================================================
// SESSIONS / PROFILE / SECURITY EVENTS
// ============================================================

export interface ActiveSession {
  id: string;
  deviceInfo: { browser?: string; os?: string; device?: string; type?: string };
  location?: { city?: string; country?: string; timezone?: string };
  ipAddress?: string;
  lastActivity: string;
  createdAt: string;
  isCurrent: boolean;
  tokenFamily?: { familyId: string; tokensInFamily: number; lastUsed: string };
}

export interface RevokeSessionsResult {
  message: string;
  revokedCount: number;
}

/** Fields the backend lets a user edit on their own profile (PUT /users/me). */
export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
}

export interface Profile {
  id: string;
  tenantId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  language?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface SecurityEvent {
  id: string;
  eventType: string;
  severity: string;
  ipAddress?: string | null;
  location?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface OrgMembership {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

// ============================================================
// INVITES
// ============================================================

export interface InvitePreview {
  email: string;
  tenantName: string;
  tenantSlug: string;
}

export interface AcceptInviteRequest {
  token: string;
  name: string;
  password: string;
}

// ============================================================
// SOCIAL
// ============================================================

export interface SocialConnection {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  primary: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

// ============================================================
// OAUTH / OIDC CONSENT
// ============================================================

export interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: "S256";
  prompt?: string;
  max_age?: number;
}

export interface ConsentDetails {
  transaction_id: string;
  csrf_token: string;
  client: {
    client_id: string;
    name: string;
    logo_url?: string;
    website_url?: string;
    privacy_policy_url?: string;
    terms_of_service_url?: string;
  };
  scopes: string[];
}

export interface ConsentDecision {
  transactionId: string;
  csrfToken: string;
  decision: "allow" | "deny";
  remember?: boolean;
}

export interface ConsentResult {
  /** Absolute URL the browser must navigate to (code on allow, access_denied on deny). */
  redirect_to: string;
}

// ============================================================
// TENANT
// ============================================================

export interface SlugAvailability {
  available: boolean;
  reason?: string;
}

export interface RegisterTenantRequest {
  workspaceName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  /** Stable per submission; the server returns the cached result on retry. */
  idempotencyKey: string;
}

export interface RegisterTenantResult {
  tenantSlug: string;
  user: { id: string; email: string; name: string };
}

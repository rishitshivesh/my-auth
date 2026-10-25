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
  /** Validated post-link destination, when the originating email carried one. */
  redirectUri?: string;
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
  redirectUri?: string;
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
  redirectUri?: string;
}

/** Result of every flow that can end in a session: login, magic link, passkey. */
export type AuthOutcome =
  | SessionEstablished
  | MfaChallengeResult
  | MfaEnrollmentRequiredResult;

/** Result of completing an MFA challenge: only a session can come back. */
export type MfaLoginOutcome = SessionEstablished;

/** Any shape a link endpoint can answer with (verify, poll). */
export type LinkOutcome = AuthOutcome | MagicLinkConfirmedElsewhere | MagicLinkPending;

export const isMfaChallenge = (o: LinkOutcome): o is MfaChallengeResult =>
  o.mfaRequired === true;

export const isMfaEnrollmentRequired = (
  o: LinkOutcome,
): o is MfaEnrollmentRequiredResult => o.status === "mfa_enrollment_required";

export const isSessionEstablished = (o: LinkOutcome): o is SessionEstablished =>
  o.mfaRequired !== true &&
  o.status !== "mfa_enrollment_required" &&
  o.status !== "confirmed-on-other-device" &&
  o.status !== "pending";

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

/** Result of link-driven actions that may carry the validated destination. */
export interface RedirectResult extends MessageResult {
  redirectUri?: string;
}

/** Optional destination (validated server-side against tenant application URLs). */
export interface RedirectOptions {
  redirectUri?: string;
}

export interface ResetLinkStatus {
  valid: boolean;
  expiresInSeconds: number;
  redirectUri?: string;
}

export interface MagicLinkSent {
  message: string;
  expiresInSeconds?: number;
  /** Only when sent with `poll: true`: redeem with signIn.pollMagicLink(). */
  pollingNonce?: string;
  /** Only when sent with `poll: true`: 6 digits to show on THIS device and type on the confirming one. */
  matchCode?: string;
}

/** Coarse description of the device that asked for a link (non-consuming preview). */
export interface MagicLinkPreview {
  requestedFrom: { userAgent: string; ip: string } | null;
  /** True when a cross-device request is pending and approving elsewhere needs its match code. */
  requiresMatchCode: boolean;
}

/**
 * verify with the correct `matchCode`: the link is spent and the polling device
 * completes the sign-in. This device receives NO session.
 */
export interface MagicLinkConfirmedElsewhere {
  status: "confirmed-on-other-device";
  mfaRequired?: undefined;
  redirectUri?: string;
}

export interface MagicLinkVerifyOptions {
  /** The 6-digit code shown on the requesting device. Omit for an ordinary same-device sign-in. */
  matchCode?: string;
}

/** Result of magic-link verify: a normal sign-in outcome or a cross-device confirmation. */
export type MagicLinkVerifyOutcome = AuthOutcome | MagicLinkConfirmedElsewhere;

export const isConfirmedOnOtherDevice = (o: LinkOutcome): o is MagicLinkConfirmedElsewhere =>
  o.status === "confirmed-on-other-device";

export interface MagicLinkPending {
  status: "pending";
  mfaRequired?: undefined;
}

export type MagicLinkPoll = AuthOutcome | MagicLinkPending;

export const isMagicLinkPending = (o: MagicLinkPoll): o is MagicLinkPending =>
  o.status === "pending";

export type CompleteMfaInput =
  | { tempToken: string; method?: "totp"; code: string }
  | { tempToken: string; method: "email"; code: string }
  | { tempToken: string; method: "webauthn"; webauthnResponse: WebAuthnCredentialJSON; sessionNonce: string };

export interface MfaEmailOtpSent {
  message: string;
  expiresInSeconds: number;
}

export type MfaWebAuthnStart = PasskeyLoginStart;

export interface TotpEnrollmentSetup {
  secret: string;
  qrCode: string;
}

/** Enrollment finished: a session exists and the one-time backup codes are shown now. */
export interface MfaEnrollmentCompleted extends SessionEstablished {
  backupCodes: string[];
}

/**
 * Step-up proof. A user with any enrolled second factor cannot use the password alone
 * (401 AUTH_MFA_REQUIRED): send password + `code`, password + passkey, or one strong factor.
 */
export type ReauthInput =
  | { method: "password"; password: string }
  | { method: "password"; password: string; code: string }
  | { method: "password"; password: string; webauthnResponse: WebAuthnCredentialJSON; sessionNonce: string }
  | { method: "totp"; code: string }
  | { method: "webauthn"; webauthnResponse: WebAuthnCredentialJSON; sessionNonce: string };

/** What a step-up must prove for the signed-in user (derived from the MFA status). */
export interface ReauthRequirements {
  /** True when any second factor is enrolled: the password alone is refused. */
  mfaEnabled: boolean;
  /** Enrolled second-factor methods (e.g. "totp", "webauthn", "email"). */
  methods: string[];
  /** Password plus a 6-digit TOTP code is possible. */
  canUseTotp: boolean;
  /** Password plus a passkey, or a passkey alone, is possible. */
  canUsePasskey: boolean;
}

export interface InviteRequestNewResult {
  message: string;
  expiresInDays: number;
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

export type PasskeyLoginStart = WebAuthnOptionsJSON & { sessionNonce: string };

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

export interface AcceptInviteResult extends MessageResult {
  /** True when the invitee can sign in right away with the password just set. */
  canSignInNow?: boolean;
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

/** The server sets the auth cookies; no tokens are ever in the body. */
export interface RegisterTenantResult {
  tenantSlug: string;
  user: { id: string; email: string; name: string };
  expiresIn: number;
}

// ============================================================
// BRANDING / AUDIT
// ============================================================

export interface Branding {
  primaryColor: string;
  logoUrl?: string;
  fontFamily: string;
  headerWeight: "regular" | "bold";
  backgroundStyle: "solid" | "gradient";
}

export type BrandingUpdate = Partial<Branding>;

export interface AuditFilters {
  userId?: string;
  requestId?: string;
  eventType?: string;
  /** ISO 8601 */
  startDate?: string;
  endDate?: string;
  cursor?: string;
  /** 1-200 */
  limit?: number;
}

export interface AuditEvent extends SecurityEvent {
  userId?: string | null;
  actorEmail?: string | null;
  tenantId?: string;
  userAgent?: string | null;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
  total: number;
}

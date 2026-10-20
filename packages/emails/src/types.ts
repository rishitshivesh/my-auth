// Props for every template. The API builds these; templates never fetch data.
// Every URL is absolute (the API knows the base URL, templates do not).

/** Optional header branding shared by every template. */
export interface BrandedProps {
  /** Tenant shown as a badge in the header. */
  tenantName?: string
  /** Replaces the product wordmark in the header (white-label tenants). */
  brandName?: string
}

/** Security alerts also carry a request id the user can quote to support. */
export interface AlertProps extends BrandedProps {
  requestId?: string
}

// Already formatted for display, e.g. "14 Oct 2026, 10:32 UTC", on every `when`.

export interface VerifyEmailProps extends BrandedProps {
  name: string
  verifyUrl: string
  expiresInHours: number
}

export interface PasswordResetProps extends BrandedProps {
  name: string
  resetUrl: string
  expiresInMinutes: number
}

export interface PasswordChangedProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

export interface SessionReuseAlertProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

export interface AccountExistsProps extends BrandedProps {
  name: string
  signInUrl: string
  resetUrl: string
}

export interface InvitationProps extends BrandedProps {
  inviterName: string
  tenantName: string
  role: string
  acceptUrl: string
  expiresInDays: number
  // An invitation from the waitlist: the person gets a new tenant of their
  // own instead of joining one. `tenantName` and `role` are then not shown.
  newTenant?: boolean
}

export interface OtpCodeProps extends BrandedProps {
  name: string
  code: string
  expiresInMinutes: number
}

export interface MfaEnabledProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

export interface MfaDisabledProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

// Sent to the owner who handed the tenant over.
export interface OwnershipTransferredFromProps extends BrandedProps {
  name: string
  tenantName: string
  newOwnerName: string
  when: string
  ip: string | null
}

// Sent to the member who became owner.
export interface OwnershipTransferredToProps extends BrandedProps {
  name: string
  tenantName: string
  previousOwnerName: string
  when: string
  ip: string | null
}

export interface AccountSuspendedProps extends BrandedProps {
  name: string
}

export interface AccountRestoredProps extends BrandedProps {
  name: string
  signInUrl: string
}

export interface TenantSuspendedProps extends BrandedProps {
  name: string
  tenantName: string
}

export interface TenantRestoredProps extends BrandedProps {
  name: string
  tenantName: string
  signInUrl: string
}

export interface SignInMethodChangedProps extends AlertProps {
  name: string
  // "Google" for now; plain text, never user supplied.
  method: string
  action: "added" | "removed"
  when: string
  ip: string | null
}

export interface AccountDeletedProps extends BrandedProps {
  name: string
  // The day the personal data is wiped, already formatted.
  purgeOn: string
}

export interface TenantDeletionScheduledProps extends BrandedProps {
  name: string
  tenantName: string
  // The day the tenant is removed, already formatted.
  deleteOn: string
  // Where an owner can cancel it.
  cancelUrl: string
}

export interface TenantDeletionCancelledProps extends BrandedProps {
  name: string
  tenantName: string
  signInUrl: string
}

export interface MagicLinkProps extends BrandedProps {
  name: string
  magicLinkUrl: string
  expiresInMinutes: number
}

export interface AccountLockedProps extends AlertProps {
  name: string
  when: string
  ip: string | null
  unlockMinutes: number
}

export interface SocialAccountLinkRequestProps extends BrandedProps {
  name: string
  // "Google", "GitHub", "Microsoft".
  provider: string
  confirmUrl: string
  expiresInMinutes: number
}

export interface PasskeyAddedProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

export interface PasskeyRemovedProps extends AlertProps {
  name: string
  when: string
  ip: string | null
}

export interface EmailPropsByName {
  "verify-email": VerifyEmailProps
  "password-reset": PasswordResetProps
  "password-changed": PasswordChangedProps
  "session-reuse-alert": SessionReuseAlertProps
  "account-exists": AccountExistsProps
  invitation: InvitationProps
  "otp-code": OtpCodeProps
  "mfa-enabled": MfaEnabledProps
  "mfa-disabled": MfaDisabledProps
  "ownership-transferred-from": OwnershipTransferredFromProps
  "ownership-transferred-to": OwnershipTransferredToProps
  "account-suspended": AccountSuspendedProps
  "account-restored": AccountRestoredProps
  "tenant-suspended": TenantSuspendedProps
  "tenant-restored": TenantRestoredProps
  "sign-in-method-changed": SignInMethodChangedProps
  "account-deleted": AccountDeletedProps
  "tenant-deletion-scheduled": TenantDeletionScheduledProps
  "tenant-deletion-cancelled": TenantDeletionCancelledProps
  "magic-link": MagicLinkProps
  "account-locked": AccountLockedProps
  "social-account-link-request": SocialAccountLinkRequestProps
  "passkey-added": PasskeyAddedProps
  "passkey-removed": PasskeyRemovedProps
}

export type EmailName = keyof EmailPropsByName

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

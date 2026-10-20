import { render } from "@react-email/render"
import { createElement, type ComponentType } from "react"
import VerifyEmail, { subject as verifyEmailSubject } from "./templates/verify-email"
import PasswordReset, { subject as passwordResetSubject } from "./templates/password-reset"
import PasswordChanged, { subject as passwordChangedSubject } from "./templates/password-changed"
import SessionReuseAlert, { subject as sessionReuseAlertSubject } from "./templates/session-reuse-alert"
import AccountExists, { subject as accountExistsSubject } from "./templates/account-exists"
import Invitation, { subject as invitationSubject } from "./templates/invitation"
import OtpCode, { subject as otpCodeSubject } from "./templates/otp-code"
import MfaEnabled, { subject as mfaEnabledSubject } from "./templates/mfa-enabled"
import MfaDisabled, { subject as mfaDisabledSubject } from "./templates/mfa-disabled"
import OwnershipTransferredFrom, { subject as ownershipTransferredFromSubject } from "./templates/ownership-transferred-from"
import OwnershipTransferredTo, { subject as ownershipTransferredToSubject } from "./templates/ownership-transferred-to"
import AccountSuspended, { subject as accountSuspendedSubject } from "./templates/account-suspended"
import AccountRestored, { subject as accountRestoredSubject } from "./templates/account-restored"
import TenantSuspended, { subject as tenantSuspendedSubject } from "./templates/tenant-suspended"
import TenantRestored, { subject as tenantRestoredSubject } from "./templates/tenant-restored"
import SignInMethodChanged, { subject as signInMethodChangedSubject } from "./templates/sign-in-method-changed"
import AccountDeleted, { subject as accountDeletedSubject } from "./templates/account-deleted"
import TenantDeletionScheduled, { subject as tenantDeletionScheduledSubject } from "./templates/tenant-deletion-scheduled"
import TenantDeletionCancelled, { subject as tenantDeletionCancelledSubject } from "./templates/tenant-deletion-cancelled"
import MagicLink, { subject as magicLinkSubject } from "./templates/magic-link"
import AccountLocked, { subject as accountLockedSubject } from "./templates/account-locked"
import SocialAccountLinkRequest, { subject as socialAccountLinkRequestSubject } from "./templates/social-account-link-request"
import PasskeyAdded, { subject as passkeyAddedSubject } from "./templates/passkey-added"
import PasskeyRemoved, { subject as passkeyRemovedSubject } from "./templates/passkey-removed"
import type { EmailName, EmailPropsByName, RenderedEmail } from "./types"

interface Template<P> {
  Component: ComponentType<P>
  subject: (props: P) => string
}

// One entry per template; the mapped type makes a missing or mistyped entry a
// compile error.
const TEMPLATES: { [N in EmailName]: Template<EmailPropsByName[N]> } = {
  "verify-email": { Component: VerifyEmail, subject: verifyEmailSubject },
  "password-reset": { Component: PasswordReset, subject: passwordResetSubject },
  "password-changed": { Component: PasswordChanged, subject: passwordChangedSubject },
  "session-reuse-alert": { Component: SessionReuseAlert, subject: sessionReuseAlertSubject },
  "account-exists": { Component: AccountExists, subject: accountExistsSubject },
  "invitation": { Component: Invitation, subject: invitationSubject },
  "otp-code": { Component: OtpCode, subject: otpCodeSubject },
  "mfa-enabled": { Component: MfaEnabled, subject: mfaEnabledSubject },
  "mfa-disabled": { Component: MfaDisabled, subject: mfaDisabledSubject },
  "ownership-transferred-from": { Component: OwnershipTransferredFrom, subject: ownershipTransferredFromSubject },
  "ownership-transferred-to": { Component: OwnershipTransferredTo, subject: ownershipTransferredToSubject },
  "account-suspended": { Component: AccountSuspended, subject: accountSuspendedSubject },
  "account-restored": { Component: AccountRestored, subject: accountRestoredSubject },
  "tenant-suspended": { Component: TenantSuspended, subject: tenantSuspendedSubject },
  "tenant-restored": { Component: TenantRestored, subject: tenantRestoredSubject },
  "sign-in-method-changed": { Component: SignInMethodChanged, subject: signInMethodChangedSubject },
  "account-deleted": { Component: AccountDeleted, subject: accountDeletedSubject },
  "tenant-deletion-scheduled": { Component: TenantDeletionScheduled, subject: tenantDeletionScheduledSubject },
  "tenant-deletion-cancelled": { Component: TenantDeletionCancelled, subject: tenantDeletionCancelledSubject },
  "magic-link": { Component: MagicLink, subject: magicLinkSubject },
  "account-locked": { Component: AccountLocked, subject: accountLockedSubject },
  "social-account-link-request": { Component: SocialAccountLinkRequest, subject: socialAccountLinkRequestSubject },
  "passkey-added": { Component: PasskeyAdded, subject: passkeyAddedSubject },
  "passkey-removed": { Component: PasskeyRemoved, subject: passkeyRemovedSubject },
}

export const EMAIL_NAMES = Object.keys(TEMPLATES) as EmailName[]

export function isEmailName(value: unknown): value is EmailName {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value)
}

// Links must be http(s): a `javascript:` or `data:` URL in an href is an attack,
// and a relative one is a bug (the template cannot know the host).
const URL_PROP = /url$/i

function assertSafeUrls(props: object): void {
  for (const [key, value] of Object.entries(props)) {
    if (!URL_PROP.test(key) || typeof value !== "string") continue
    let protocol: string
    try {
      protocol = new URL(value).protocol
    } catch {
      throw new Error(`Email prop "${key}" is not an absolute URL`)
    }
    if (protocol !== "https:" && protocol !== "http:") {
      throw new Error(`Email prop "${key}" must be an http(s) URL`)
    }
  }
}

// Text a user controls (their display name, a tenant name) ends up in the
// body and the subject of mail we send to someone else, so it is reduced to one
// plain, short line: no line breaks (header injection, fake paragraphs), no
// control, zero-width or bidirectional-override characters (spoofed or reversed
// text), and a length cap (a long message posing as ours).
const DISPLAY_PROPS = new Set([
  "name",
  "inviterName",
  "tenantName",
  "role",
  "newOwnerName",
  "previousOwnerName",
  "brandName",
  "provider",
  "requestId",
])
export const MAX_DISPLAY_LENGTH = 80
// Built from code points so no invisible character sits in this source file.
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f], // C0 controls, incl. CR and LF
  [0x007f, 0x009f], // DEL and C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x061c, 0x061c], // Arabic letter mark
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x200b, 0x200f], // zero-width characters and directional marks
  [0x2028, 0x202e], // line and paragraph separators, bidi embeddings and overrides
  [0x2060, 0x206f], // word joiner and invisible operators, bidi isolates
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
]
const hex = (n: number) => `\\u{${n.toString(16)}}`
const INVISIBLE_OR_CONTROL = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) => `${hex(a)}-${hex(b)}`).join("")}]`,
  "gu"
)

export function toDisplayText(value: string): string {
  const oneLine = value
    .normalize("NFKC")
    .replace(INVISIBLE_OR_CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
  const chars = Array.from(oneLine)
  return chars.length > MAX_DISPLAY_LENGTH
    ? `${chars.slice(0, MAX_DISPLAY_LENGTH - 1).join("")}…`
    : oneLine
}

function sanitizeDisplayProps<P extends object>(props: P): P {
  const entries = Object.entries(props).map(([key, value]) =>
    DISPLAY_PROPS.has(key) && typeof value === "string"
      ? [key, toDisplayText(value)]
      : [key, value]
  )
  return Object.fromEntries(entries) as P
}

// A subject is a single header line: never any line break, and bounded.
const MAX_SUBJECT_LENGTH = 120

function toSubject(value: string): string {
  return Array.from(toDisplayText(value)).slice(0, MAX_SUBJECT_LENGTH).join("")
}

// The only function the API calls. Swapping the rendering engine later means
// changing this file, nothing in the API.
export async function renderEmail<N extends EmailName>(
  name: N,
  props: EmailPropsByName[N]
): Promise<RenderedEmail> {
  const template = TEMPLATES[name] as Template<EmailPropsByName[N]>
  assertSafeUrls(props)
  const safe = sanitizeDisplayProps(props)
  const element = createElement(template.Component, safe)
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { subject: toSubject(template.subject(safe)), html, text }
}

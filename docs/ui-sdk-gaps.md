# UI / SDK contract gaps

Screen flows from `apps/docs/content/docs/dev/screen-ux-checklist/index.mdx` that cannot be built
on a real backend contract today. The SDK (`packages/sdk-typescript`) wraps everything that exists
and never fakes the rest. Verified against `apps/auth-service/src` on 2026-10-25.

| Flow | Status | Detail |
|---|---|---|
| Password recovery by link | Closed | `validateResetLink`, `resetPasswordWithToken`, `redirectUri` (backend pass 2). |
| Pre-session MFA enrollment | Closed | `signIn.enrollTotpSetup` / `enrollTotpConfirm`. |
| Email-OTP / passkey as login second factor | Closed | `completeMfa`, `requestMfaEmailOtp`, `startMfaWebAuthn`. |
| Step-up / recent auth | Closed | `account.reauthenticate` / `startReauthWebAuthn` use `/auth/reauth`; `useRecentAuth` wired. |
| Cross-device completion of magic links | Closed | `sendMagicLink(email, {poll:true})`, `pollMagicLink`. |
| Distinct link failure states | Closed | `LINK_EXPIRED` / `LINK_ALREADY_USED` / `LINK_WRONG_ACCOUNT`, `linkFailureReason`. |
| Destination retention for email links | Closed | Optional `redirectUri` on send/forgot/resend, returned by verify/validate/reset. |
| Invite expired/used (invitee side) | Closed | `invites.requestNew`. |
| Workspace self-registration session | Closed | Cookies set, no tokens in body; `expiresIn` returned. |
| Social claim-session claims | Closed | Claims returned; SDK only backfills for older servers. |
| Passwordless sign-up | Open | `register` requires a password; `magic-link/send` ignores unknown emails. Suggest `password` optional on `POST /auth/register` when the tenant allows it. |
| Passkey sign-in without typing an email | Open | `webauthn/login/start` requires `email`. Suggest empty email returning discoverable-credential options. |
| Invite: sign in on accept / wrong-account check | Open | Accept sets no session (`canSignInNow` is only a hint); no check that a signed-in user is the invitee. Suggest optional session issue on accept and a `LINK_WRONG_ACCOUNT` check when a session cookie exists. |
| Response envelope consistency | Open | `magic-link/verify`, `magic-link/poll`, `webauthn/login/finish` (`@Res()`) and OAuth consent (`@RawResponse()`) skip `{status,data}`; `magic-link/send` / `social/link/token` may double wrap. SDK tolerates all. Suggest `@Res({passthrough:true})` everywhere. |
| Profile response shape / email change / avatar upload | Open | `/users/me` returns the raw entity; no email-change or upload API. Add a response DTO first. |
| Branding logo upload | Open (SDK) | Multipart `POST /tenants/current/branding/logo`; the JSON transport cannot send it yet. |
| Admin / management APIs | Open (SDK) | Users, RBAC, OAuth clients, webhooks, SCIM, LDAP, dashboard still use `client.request` / `packages/admin-client`. Audit list/export and branding are now typed. |

Notes

- Two session families exist (`/sessions/*` and `/users/me/sessions`). The SDK uses `/sessions/*` only.
- `login` lockout surfaces as `AUTH_ACCOUNT_LOCKED` (423) or `RATE_LIMITED` with `retryAfterSeconds`.

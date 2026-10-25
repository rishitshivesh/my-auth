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

## Open in the UI

`TODO(gap:...)` markers in `apps/admin-portal` (grep `TODO(gap:`), grouped by cause. Several auth markers
predate the backend passes above and should be re-checked against the table before more UI work.

| Area | Markers | What is missing |
|---|---|---|
| Auth (hosted) | Passwordless sign-up; Password recovery by link; Pre-session MFA enrollment; Email-OTP/passkey second factor; Destination retention; Invite lifecycle (invitee); Social login completion claims | Marked Closed in the table above for the backend and SDK; the portal views still carry the older notices and fallbacks. Passwordless sign-up stays genuinely open. |
| Account | Profile response shape (clear a field, password-exists flag); Step-up / recent auth; Social link-token claims | Profile DTO; UI wiring of `account.reauthenticate`; link-token user claim. |
| Connected applications | N02-grants | `GET /users/me/consents`, `DELETE /users/me/consents/:clientId`. Screen renders the proposed-capability view. |
| Workspace | T04-register-session | Registration session handling in the portal now that cookies are set. |
| Users and access | T02-boolean-filter, T08-member-lookup, N10-resend | Boolean list filter DTO, group members by user id only (names resolved client-side), no invite resend endpoint. |
| Applications | T11-edit-contract, T12-sdk-snippets | Client update accepts a limited field set; tested SDK snippets contract. |
| Connections | N09-provisioning-history | Per-run SCIM provisioning history. |
| Tenant admin | T20 (provider credential screen), T22 (domains), N01 (MFA/session policy) | Dedicated credential editing screen (endpoint exists); domains and policy backends. |
| Platform | P03 (owner email ignored, immediate delete), P05 (SMTP edit/test), P06 (server-side search/paging/export), P07 (cleanup stats, global user lookup) | Platform-scoped endpoints for each. |

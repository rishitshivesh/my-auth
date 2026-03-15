# WebAuthn MFA Settings + Social Account Linking — Design

**Date:** 2026-03-15

**Goal:** Replace the settings page's passkey toggle and social credentials forms with a proper passkey registration/management flow (on a dedicated security page) and a connected-accounts section for linking/unlinking Google, GitHub, and Microsoft to the logged-in admin portal user's account.

---

## Problem Statement

The current `/dashboard/settings` page has two wrong patterns:

1. **Passkey as a toggle** — WebAuthn requires device registration (challenge/response), not a boolean flag. Toggling it on does nothing useful.
2. **Social provider credentials forms** — Those (client ID / client secret) are for configuring a *tenant's* social login for their end-users. In the admin portal, social login means linking your own Google/GitHub account to your admin account.

---

## Page Structure

### `/dashboard/settings` (updated)

Retains:
- Password (always on, informational card)
- Magic Link (toggle — unchanged)

Removes:
- Passkey toggle
- Social provider OAuth credential forms

Adds:
- **Connected Accounts** section: shows Google, GitHub, Microsoft. Each shows link state and a Connect / Disconnect button.
- Link to the new Security page in the sidebar.

### `/dashboard/settings/security` (new)

MFA hub for the logged-in user:

- **TOTP** — status card. Shows enabled/disabled, verification date. Links to `/u/mfa/setup` to enable or manage.
- **Passkeys** — device list. Each row: device name, created at, last used. Delete button per row. "Add a passkey" CTA at the bottom.

Sidebar: add "Security" nav item under Settings group.

---

## Passkey Registration Flow

All backend endpoints already exist (no backend changes needed for passkeys):

| Step | Endpoint |
|------|----------|
| Start registration | `POST /mfa/webauthn/register/start` |
| Finish registration | `POST /mfa/webauthn/register/finish` |
| List credentials | `GET /mfa/webauthn/credentials` |
| Delete credential | `DELETE /mfa/webauthn/credentials/:id` |

**SDK additions** (`packages/fortknox-sdk/src/core/client.ts`):
- `startPasskeyRegistration()` — authenticated `POST /mfa/webauthn/register/start`
- `finishPasskeyRegistration(response, deviceName?)` — authenticated `POST /mfa/webauthn/register/finish`
- `listPasskeys()` — authenticated `GET /mfa/webauthn/credentials`
- `deletePasskey(credentialId)` — authenticated `DELETE /mfa/webauthn/credentials/:id`

**SDK React provider** (`packages/fortknox-sdk/src/react/index.tsx`): expose the four methods above.

**Frontend registration sequence:**
1. User clicks "Add a passkey"
2. Call `startPasskeyRegistration()` → get options/challenge
3. Pass to `@simplewebauthn/browser` `startRegistration(options)`
4. Show modal: enter device name (optional, defaults to browser/platform string)
5. Call `finishPasskeyRegistration(registrationResponse, deviceName)`
6. On success: refresh credentials list, show success toast

**Delete:** call `deletePasskey(credentialId)`, refresh list, show confirmation.

---

## Social Account Linking Flow

### Backend changes needed

The existing OAuth endpoints (`GET /social/google/login` etc.) are for unauthenticated login. We need linking-specific endpoints that:
1. Are only reachable when authenticated (carry JWT in state)
2. Skip the login-or-create logic and go straight to `UserSocialConnection` creation
3. Don't require email confirmation (user is already authenticated)

**New endpoints** (`apps/auth-service/src/modules/social-auth/social-auth.controller.ts`):

```
GET /social/link/google    → initiates OAuth, sets state.mode = "link", state.userId
GET /social/link/github    → same for GitHub
GET /social/link/microsoft → same for Microsoft
```

These endpoints require a valid JWT (use `@Protected()`). They embed the userId in the encrypted OAuth state so the callback can identify who is linking.

**Callback modification** (`social-auth.service.ts` `handleCallback`):
- Detect `state.mode === "link"` + `state.userId`
- Skip login-or-create
- Create `UserSocialConnection` directly
- Redirect to `/u/auth/callback?ct=<completionToken>&mode=link`

The `/u/auth/callback` page already handles `ct` relay — it just needs to handle `mode=link` by not setting auth state (user is already logged in), just showing success and redirecting back to `/dashboard/settings`.

**SDK additions:**
- `getSocialConnections()` → `GET /social/connections`
- `unlinkSocialAccount(provider)` → `DELETE /social/connections/:provider`
- `initiateSocialLinking(provider)` → navigates to `GET /social/link/:provider` (with auth token in header or as query param — see note below)

**Auth token relay for linking:** Since the linking start endpoint is a browser redirect (not a fetch), the JWT cannot be passed as a Bearer header. Two options:
- **(Recommended)** Issue a short-lived (60s) link token from a new authenticated endpoint `POST /social/link/token`, redirect to `/social/link/:provider?lt=<linkToken>`. The OAuth state embeds the userId decoded from the link token.
- Alternative: pass the access token as a query param in the redirect URL (leaks token in URL/logs — avoid).

### Frontend

**Connected Accounts component** (in `/dashboard/settings`):
- Fetch connections from `getSocialConnections()`
- For each of Google / GitHub / Microsoft:
  - If connected: show provider icon, connected email/display name, "Disconnect" button
  - If not connected: show provider icon, "Connect" button
- "Connect" → calls `initiateSocialLinking(provider)` (fetches link token, then redirects)
- "Disconnect" → calls `unlinkSocialAccount(provider)`, refresh list

**`/u/auth/callback` page updates:**
- Detect `mode=link` query param after OAuth redirect
- If present: show "Account linked successfully" and redirect to `/dashboard/settings` instead of setting auth state

---

## Summary of Changes

| Area | Change |
|------|--------|
| `/dashboard/settings` | Remove passkey toggle + social credentials forms; add Connected Accounts section |
| `/dashboard/settings/security` | New page: TOTP status card + Passkeys device management |
| Dashboard sidebar | Add "Security" nav item |
| `fortknox-sdk/client.ts` | Add 4 passkey methods + 3 social linking methods |
| `fortknox-sdk/react/index.tsx` | Expose new SDK methods via context |
| `social-auth.controller.ts` | Add `GET /social/link/:provider` + `POST /social/link/token` endpoints |
| `social-auth.service.ts` | Handle `mode=link` in `handleCallback`; add `createLinkToken` |
| `/u/auth/callback` page | Handle `mode=link` redirect (→ `/dashboard/settings` on success) |

No database migrations needed — `UserSocialConnection` and `MfaSettings` entities already support all of this.

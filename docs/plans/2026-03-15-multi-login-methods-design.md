# Multi-Login Methods Design

**Date:** 2026-03-15

**Goal:** Wire up all login methods (social, magic link, passkey) end-to-end, and add a tenant settings UI to enable/disable them per tenant.

**Approach:** C — State-token relay. Tokens never appear in browser redirect URLs. Social OAuth uses a short-lived completion token (60s, one-time-use JWT) to bridge the redirect gap. Magic link and WebAuthn use direct API calls.

---

## Architecture

### Completion Token Pattern (Social Only)

```
FE → redirect to /auth/social/google/login?tenant_id=xxx
  → BE creates stateJWT = sign({ tenantId, returnUrl, nonce })
  → Google redirects to /auth/social/google/callback?code=xxx&state=stateJWT
  → BE verifies state, creates session, sets refresh httpOnly cookie
  → BE creates completionToken = sign({ accessToken }, { expiresIn: '60s' })
  → BE redirects to {returnUrl}/u/auth/callback?ct={completionToken}
  → FE calls POST /auth/social/claim-session { ct }
  → BE verifies JWT, returns { accessToken }
  → SDK.setSession(accessToken) → redirect to /dashboard
```

The `completionToken` has no credential value on its own — it requires the refresh cookie (SameSite=strict) to be useful, and is consumed on first use.

### Magic Link Pattern (Direct API)

```
FE → POST /auth/magic-link/send { email }
  → BE stores magicLinkTokenHash + magicLinkExpiresAt (10min) on User
  → BE sends email: {PORTAL_URL}/u/magic-link?token={rawToken}
  → User clicks link → /u/magic-link page
  → Page calls POST /auth/magic-link/verify { token }
  → BE validates hash, clears fields, creates session, sets refresh cookie
  → Returns { accessToken }
  → SDK.setSession(accessToken) → redirect to /dashboard
```

### Passkey (WebAuthn) Pattern (Direct API)

```
FE PasskeyLoginButton → sdk.handlePasskeyLogin(email)
  → POST /auth/webauthn/login/start { email } → returns challenge options
  → @simplewebauthn/browser: startAuthentication(options) → signed assertion
  → POST /auth/webauthn/login/finish { email, assertion }
  → BE verifies, creates session, sets refresh cookie, returns { accessToken }
  → SDK.setSession(accessToken) → redirect to /dashboard
```

---

## Section 1: Social Login

### Backend Changes

**`social-auth.controller.ts`:**
- `GET /auth/social/google/login` — override AuthGuard to inject `state = stateJWT({ tenantId, returnUrl, nonce })` from `req.query.tenant_id`
- Same for GitHub, Microsoft
- Callback handlers: verify stateJWT, extract tenantId, call `socialAuthService.handleCallback(...)`, set refresh cookie, create completionToken JWT (60s), redirect to `{returnUrl}/u/auth/callback?ct={completionToken}`
- New: `POST /auth/social/claim-session { ct }` — verify JWT, return `{ accessToken }`

**`social-auth.service.ts`:**
- `handleCallback` already returns `{ accessToken, refreshToken }` — ensure it also returns user info
- Existing social strategies (google, github, microsoft) use Passport — need dynamic state injection

### SDK Changes (`packages/fortknox-sdk/src/core/client.ts`)

```typescript
initiateSocialLogin(provider: string): void {
  const returnUrl = typeof window !== 'undefined' ? window.location.origin : '';
  window.location.href = `${this.config.baseURL}/auth/social/${provider}/login?tenant_id=${this.config.tenant}&return_url=${encodeURIComponent(returnUrl)}`;
}

async claimSocialSession(completionToken: string): Promise<void> {
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/social/claim-session`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': this.config.tenant },
    body: { ct: completionToken },
    credentials: 'include',
  });
  if (!response.ok) throw this.createError(response);
  const { accessToken } = response.data?.data;
  setAccessToken(this.state, accessToken);
  this.emit({ type: 'token_refreshed', accessToken });
  this.config.onTokenRefreshed(accessToken);
}
```

**React provider:** expose `initiateSocialLogin` and `claimSocialSession`

### Frontend Changes

**`credentials-step.tsx`:** social branch calls `client.initiateSocialLogin(provider.replace('social-', ''))`

**New page: `apps/admin-portal/app/u/auth/callback/page.tsx`:**
- Reads `?ct=` from search params
- Calls `client.claimSocialSession(ct)`
- On success: `router.replace('/dashboard')`
- On error: `router.replace('/u/login?error=social_failed')`

---

## Section 2: Magic Link

### Backend Changes

**Database (`packages/database/src/entities/user.entity.ts`):**
```typescript
@Column({ type: 'varchar', nullable: true, name: 'magic_link_token', select: false })
magicLinkToken?: string; // SHA-256 hash

@Column({ type: 'timestamptz', nullable: true, name: 'magic_link_expires_at' })
magicLinkExpiresAt?: Date;
```
Migration: add two nullable columns to `users` table.

**New endpoints in `auth.controller.ts`:**
- `POST /auth/magic-link/send { email }` → `authService.sendMagicLink(tenantId, email)`
- `POST /auth/magic-link/verify { token }` → `authService.verifyMagicLink(tenantId, token)` → returns `{ accessToken }` + sets refresh cookie

**`auth.service.ts`:**
```typescript
async sendMagicLink(tenantId: string, email: string): Promise<void>
  // find user, generate 32-byte token, hash it, store on user with 10-min expiry
  // send email: emailService.sendMagicLinkEmail(user, rawToken)

async verifyMagicLink(tenantId: string, token: string): Promise<{ accessToken, refreshToken }>
  // hash token, find user where magicLinkToken = hash AND expiresAt > now
  // clear magicLinkToken fields, create session, generate tokens
```

**`email.service.ts`:** add `sendMagicLinkEmail(user, token)` using existing template infrastructure.

### SDK Changes

```typescript
async sendMagicLink(email: string): Promise<void>
async verifyMagicLink(token: string): Promise<void>
  // calls /auth/magic-link/verify, setSession on success
```

**React provider:** expose `sendMagicLink`, `verifyMagicLink`

### Frontend Changes

**`magic-link-form.tsx`:** call `sendMagicLink(email)`, show "Check your email" confirmation screen with email address displayed.

**New page: `apps/admin-portal/app/u/magic-link/page.tsx`:**
- Reads `?token=` from search params
- On mount: calls `verifyMagicLink(token)`
- Shows loading → success (redirect to dashboard) or error (link expired/already used)

---

## Section 3: Passkey (WebAuthn)

### SDK Changes

```typescript
async handlePasskeyLogin(email: string): Promise<void> {
  // 1. Get challenge from server
  const startResponse = await this.request({
    url: `${this.config.baseURL}/auth/webauthn/login/start`,
    method: 'POST',
    body: { email },
  });
  if (!startResponse.ok) throw this.createError(startResponse);
  const options = startResponse.data?.data;

  // 2. Browser WebAuthn prompt
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const assertion = await startAuthentication(options);

  // 3. Finish on server
  const finishResponse = await this.request({
    url: `${this.config.baseURL}/auth/webauthn/login/finish`,
    method: 'POST',
    body: { email, response: assertion },
    credentials: 'include',
  });
  if (!finishResponse.ok) throw this.createError(finishResponse);
  const { accessToken } = finishResponse.data?.data;
  setAccessToken(this.state, accessToken);
  this.emit({ type: 'token_refreshed', accessToken });
  this.config.onTokenRefreshed(accessToken);
}
```

**React provider:** expose `handlePasskeyLogin`

### Backend Changes

**`auth.controller.ts` webauthn/login/finish:** ensure response sets refresh cookie (same pattern as login/social callback) and returns `{ accessToken }`.

**`auth.service.ts` finishWebAuthnLogin:** already creates session and returns tokens — just ensure controller sets the cookie.

### Frontend Changes

**`passkey-login-button.tsx`:** replace stub with real call to `client.handlePasskeyLogin(email)`, handle success (redirect to dashboard) and error (show inline error).

**New dependency:** `@simplewebauthn/browser` in `apps/admin-portal/package.json`

---

## Section 4: Tenant Settings UI

### Backend Changes

**New endpoints in `dashboard.controller.ts`:**
- `GET /dashboard/tenant-settings` → returns `{ featureFlags, socialProviders: [{ provider, enabled, clientId, hasSecret }] }`
- `PATCH /dashboard/tenant-settings` body `{ featureFlags }` → updates `tenant.featureFlags`
- `PATCH /dashboard/tenant-settings/social/:provider` body `{ enabled, clientId?, clientSecret? }` → upserts `TenantSocialProvider`

**`dashboard.module.ts`:** add `TenantSocialProvider` to `TypeOrmModule.forFeature`

### Frontend Changes

**`components/dashboard/dashboard-sidebar.tsx`:** add "Settings" nav item (gear icon) → `/dashboard/settings`

**New page: `apps/admin-portal/app/dashboard/settings/page.tsx`:**
- Method toggles: Password (always on, not toggleable), Magic Link, Passkey
- Social provider section: Google, GitHub, Microsoft — each with toggle + collapsible credentials form (client ID + secret fields, secret write-only)
- Uses `useTenantSettings()` + `useUpdateTenantSettings()` + `useUpdateSocialProvider()` React Query hooks

**`apps/admin-portal/lib/queries.ts`:** add:
- `useTenantSettings()` — `useQuery(['tenant', 'settings'])`
- `useUpdateTenantSettings()` — `useMutation(PATCH /dashboard/tenant-settings)`
- `useUpdateSocialProvider(provider)` — `useMutation(PATCH /dashboard/tenant-settings/social/:provider)`

---

## SDK Type Changes (`packages/fortknox-sdk/src/core/types.ts`)

Add to `AuthContextValue`:
```typescript
initiateSocialLogin: (provider: string) => void;
claimSocialSession: (ct: string) => Promise<void>;
sendMagicLink: (email: string) => Promise<void>;
verifyMagicLink: (token: string) => Promise<void>;
handlePasskeyLogin: (email: string) => Promise<void>;
```

---

## `login-intent` Compatibility

No changes needed. `getLoginIntent()` already reads:
- `featureFlags.magicLinkEnabled`, `featureFlags.passkeyEnabled` for non-social methods
- `TenantSocialProvider.enabled` for social providers (via `getAvailableSocialProviders`)

Once Settings page saves changes, `login-intent` automatically reflects them.

---

## File Summary

| File | Change |
|------|--------|
| `packages/database/src/entities/user.entity.ts` | Add `magicLinkToken`, `magicLinkExpiresAt` |
| `apps/auth-service/src/modules/auth/auth.service.ts` | Add `sendMagicLink`, `verifyMagicLink` |
| `apps/auth-service/src/modules/auth/auth.controller.ts` | Add magic link endpoints, webauthn cookie fix |
| `apps/auth-service/src/modules/social-auth/social-auth.controller.ts` | State JWT injection, completionToken, claim-session endpoint |
| `apps/auth-service/src/modules/email/email.service.ts` | Add `sendMagicLinkEmail` |
| `apps/auth-service/src/modules/dashboard/dashboard.controller.ts` | Add tenant-settings endpoints |
| `apps/auth-service/src/modules/dashboard/dashboard.module.ts` | Add `TenantSocialProvider` entity |
| `packages/fortknox-sdk/src/core/client.ts` | Add social, magic link, passkey methods |
| `packages/fortknox-sdk/src/core/types.ts` | Extend `AuthContextValue` |
| `packages/fortknox-sdk/src/react/index.tsx` | Expose new methods |
| `apps/admin-portal/components/auth/credentials-step.tsx` | Wire social to `initiateSocialLogin` |
| `apps/admin-portal/components/auth/magic-link-form.tsx` | Wire to `sendMagicLink` |
| `apps/admin-portal/components/auth/passkey-login-button.tsx` | Wire to `handlePasskeyLogin` |
| `apps/admin-portal/app/u/auth/callback/page.tsx` | New: claim social session |
| `apps/admin-portal/app/u/magic-link/page.tsx` | New: verify magic link |
| `apps/admin-portal/app/dashboard/settings/page.tsx` | New: tenant settings UI |
| `apps/admin-portal/components/dashboard/dashboard-sidebar.tsx` | Add Settings nav item |
| `apps/admin-portal/lib/queries.ts` | Add tenant settings hooks |

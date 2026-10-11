# ADR-0003: Access-token delivery to browsers

- Status: Accepted
- Date: 2026-10-11

## Context
Project rules said tokens are delivered only as httpOnly cookies. `POST /auth/login` and
`POST /auth/refresh` also returned `accessToken` in the JSON body so the SDK could send bearer
tokens. A body copy is readable by any script on the page, which removes the XSS protection
httpOnly cookies provide.

## Options considered
1. **Cookie-only for browsers; bearer only for server-to-server and native clients.**
2. Keep the body copy but only when the client opts in (e.g. `X-Token-Delivery: body`), off for
   the admin portal.
3. Status quo.

## Decision
**Option 1, applied everywhere — no opt-in header, no body token for any first-party endpoint.**

Option 2 exists to avoid breaking a server-to-server or native-client consumer that needs a
bearer token because it cannot hold an httpOnly cookie. This codebase has no such consumer:
`packages/sdk-typescript` is explicitly a browser/React/Next.js client (see root README), the
backend's `JwtStrategy` and `TokenVerificationGuard` already accept the cookie as the sole
credential, and the SDK already sends `credentials: "include"` on every request. The OAuth 2.0
`/oauth/token` endpoint is unaffected by this decision — returning tokens in the body there is
required by RFC 6749, not the cookie-delivery pattern this ADR covers.

## Implementation
- `POST /auth/login`, `/auth/refresh`, `/auth/mfa/verify`, `/auth/mfa/verify-backup`,
  `/auth/webauthn/login/finish`, `/auth/magic-link/verify`, `/auth/social/claim-session`, and
  `/superadmin/create-first-admin` no longer put `accessToken` in the response body. Tokens are
  set exclusively via `setAuthCookies`/`setAccessTokenCookie` (`common/http/auth-cookies.ts`).
- Each of those endpoints instead returns `expiresIn` (seconds, from the new
  `ACCESS_TOKEN_TTL_SECONDS` constant) and, where the service already computes it, `session`
  (`{ tenantId, tenantSlug, groups }` — the same non-secret claims already present in the JWT
  payload, exposed so clients can read them without ever holding the token).
- `@scrolloop/sdk` no longer tracks or requires the access token client-side. `AuthState.authenticated`
  (a boolean) replaces token possession as the signal for `isAuthenticated()`; `getSessionClaims()`
  replaces `getTokenClaims()`; `getAccessToken()` is removed. The request pipeline always attempts
  one silent refresh + retry on a 401, rather than gating on "do we have a token."

## Consequences
- Breaking change to `@scrolloop/sdk`'s public API (`AuthState`, `onTokenRefreshed` signature,
  `LoginResponse`, `getTokenClaims`/`getAccessToken`/`isInGroup`/`isSentryInternal`/`getUserTenantId`
  removed). No in-repo consumer used the removed methods beyond what this change migrates.
- Fixes a latent bug: `verifyMfaLogin`, `claimSocialSession`, `verifyMagicLink`, and
  `finishPasskeyLogin` previously threw `"No access token in response"` on every call, because
  those endpoints never actually returned one — the SDK's own possession check was unreachable-safe
  code masking a dead path.
- The SDK's 401 → refresh → retry path no longer gates on "did we previously hold a token," so it
  is now reachable by fully anonymous traffic (any 401 triggers one refresh attempt). `POST
  /auth/refresh` gained `@RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })` to cap that.
- The social-login completion token never carried tenant/group claims (it only wraps the access
  token), so `claimSocialSession()` cannot populate `session` from its own response. The SDK
  backfills it with one best-effort `refresh` call after claiming the session (the refresh-token
  cookie is already set from the OAuth callback step), so `getSessionClaims()` is consistent across
  every login path without widening the social-login access-token payload's claims.

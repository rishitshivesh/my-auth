# ADR-0007: One-time link tokens and distinct link states

- Status: Accepted
- Date: 2026-10-25

## Context
Password reset only emailed a 6-digit code, so there was no clickable, scanner-safe link and no way
for a UI to tell "expired" from "already used" from "unknown": verify-email and magic-link cleared the
token on use and answered `AUTH_TOKEN_INVALID` for every failure.

## Decision
- `LinkTokenService` (Redis, tenant + purpose scoped) issues 256-bit random tokens, stores only the
  SHA-256, and remembers spent/expired links for 7 days. `inspect` never consumes (GET validate is
  scanner-safe); `consume` claims with an atomic `SET NX`, so concurrent use has one winner. Reset
  links use it; a new request or a completed reset supersedes the previous link.
- Existing DB-backed tokens (verify-email, magic link) keep their columns; a Redis tombstone records
  that a token was spent and the lookup without the expiry filter detects "expired". Invites already
  had `acceptedAt`/`expiresAt`.
- New stable codes `LINK_EXPIRED` (410), `LINK_ALREADY_USED` (409), `LINK_WRONG_ACCOUNT` (403). The
  token is the bearer secret, so these states reveal nothing about whether an account exists.
- The 6-digit reset code stays as a fallback; the first success spends both.
- `redirectUri` is validated against portal origins and the tenant's OAuth client redirect URIs and
  stored beside the token (Redis metadata); never a free-form redirect.
- Cross-device magic link uses number matching, because a bare polling nonce is device-code
  phishing (an attacker requests a link for the victim, the victim clicks it, the attacker's poll
  gets a session). `send` returns a nonce AND a 6-digit match code only to the requesting device
  (both hashed server side, tenant-bound, 10 minutes). A plain click signs in the clicker and voids
  the request. Only a verify carrying the correct match code completes the poll, and then the
  confirming device gets no session. Wrong codes are counted (void after 5, constant-time compare,
  link not spent). `GET magic-link/preview` is non-consuming and shows the requester's coarse
  user agent and IP so the victim can recognise a request they did not make. Residual risk: a user
  who is socially engineered into typing the attacker's code (the standard number-matching limit).
- Step-up (`POST /auth/reauth`) must be as strong as sign-in: with any enrolled second factor the
  password alone is refused (`AUTH_MFA_REQUIRED`); password needs a second factor in the same request,
  or TOTP / passkey is used alone. The step-up `amr` is exactly the factors proven in that request,
  also across later refreshes, and is never merged with the original session's `amr`.

## Consequences
Reset links and nonces live in Redis: a Redis flush invalidates outstanding reset links (the user
requests another). Redis is already required for sessions, rate limits and mail.
Side finding fixed in the same pass: `TenantMfaPolicy` was pinned to the `public` schema although the
table lives in tenant schemas, so every policy lookup failed with 42P01 and silently fell back to
"MFA not enforced". The pin is removed; required-MFA policies now actually apply.

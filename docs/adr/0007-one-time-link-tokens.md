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
- Cross-device magic link: the requesting device keeps a nonce that is never emailed; it is stored
  hashed, tenant-bound, single use, 10 minutes.

## Consequences
Reset links and nonces live in Redis: a Redis flush invalidates outstanding reset links (the user
requests another). Redis is already required for sessions, rate limits and mail.
Side finding fixed in the same pass: `TenantMfaPolicy` was pinned to the `public` schema although the
table lives in tenant schemas, so every policy lookup failed with 42P01 and silently fell back to
"MFA not enforced". The pin is removed; required-MFA policies now actually apply.

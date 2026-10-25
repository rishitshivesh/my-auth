# Security model

This document records the controls that exist **today**, how they are verified, and the known
gaps. Open gaps reference [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md). Vulnerability reporting:
[../SECURITY.md](../SECURITY.md).

> Compliance note: these controls make the platform *SOC 2 / GDPR ready* in the sense of having
> technical controls an auditor can test. Certification (e.g. SOC 2 Type II) additionally
> requires an observation period and organisational controls outside this repository.

## Controls in place

| Area | Control | Where | Verified by |
|---|---|---|---|
| Passwords | Argon2id hashing; strength rules; reuse check against last 5 | `packages/security`, `AuthService` | unit + smoke |
| Brute force | Per-account lockout (5 attempts / 15 min); Redis sliding-window rate limits on auth endpoints | `BruteForceService`, `RateLimitGuard` | `rate-limit.guard.spec` |
| Password reset | 6-digit CSPRNG code bound to tenant + email, 15 min TTL, 5-attempt budget then burned, constant-time compare, single use, revokes all sessions and refresh tokens | `AuthService.resetPassword` | live test; smoke (contract) |
| Tokens | RS256 access tokens with `kid`; private keys AES-256-GCM encrypted at rest | `JwksService` | `jwks.service.spec` |
| Refresh tokens | Opaque, hashed at rest, rotated, family revocation on reuse | `OAuthRefreshTokenService` | `session-management.service.spec` |
| Sessions | Server-side sessions (Postgres + Redis); logout revokes both; tokens rejected after logout | `SessionService`, `SessionGuard` | smoke |
| Cookies | httpOnly, Secure (production), SameSite=Strict, optional shared domain; one definition | `common/http/auth-cookies.ts` | live header check |
| MFA | Email OTP in Redis (hashed, TTL, 5 attempts, single use); TOTP, Argon2id-hashed backup codes, WebAuthn with atomic counter (replay detection), tenant MFA policy enforced on all login paths | `mfa` module | `mfa-enforcement.spec`, `webauthn.service.spec` |
| Tenant isolation | Schema-per-tenant + `tenant_id` filters + token/tenant binding guard | middleware, guards | `tenant-schema.middleware.spec`, `scripts/verify-tenant-isolation.ts` |
| Authorization | IAM-style policies, explicit deny, permission boundaries | `rbac` | `policy-evaluation.service.spec`, `rbac-permissions-boundary.spec` |
| Input validation | Global `ValidationPipe` (whitelist, transform) on class DTOs | `app.module.ts` | — (gaps: P0-5) |
| Transport/headers | Helmet; strict CORS allow-list; `TRUST_PROXY` for correct client IPs | `app.module.ts` | — |
| Audit trail | Security events for auth, MFA, admin and email actions; metadata sanitised (secrets stripped recursively); CSV export with formula-injection protection | `SecurityEventService`, `audit` | `security-event.service.spec` |
| OAuth PKCE | S256 only, explicit method, mandatory for public clients, constant-time verify | `oauth` | `oauth-token.pkce.spec` |
| Webhooks | HMAC-SHA256 signatures; SSRF protection (DNS fail-closed, IPv4-mapped IPv6, no redirects) | `webhook` | — |
| Secrets | All secrets from env; validated at boot; never logged | `env.validation.ts` | boot |
| Supply chain | `yarn install --immutable` in CI; lockfile committed | CI | CI |

## Known gaps (tracked)

| Gap | Risk | Plan item |
|---|---|---|
| SAML assertions unsigned; SSO endpoint not wired | SAML unusable / unsafe if enabled | P0-3 |
| Per-tenant signing keys not provisioned | Weaker tenant blast-radius isolation | P0-4 |
| Some request bodies are not class DTOs | Unvalidated input reaches services | P0-5 |
| Access token also returned in response body | Token exposure to page scripts | P0-8 / ADR-0003 |
| Per-request pinned DB connection | Pool exhaustion → availability | P1-9 |
| Audit log mutable; no retention / GDPR erasure endpoints | Compliance evidence | P1-13 |
| DB TLS unverified unless `DB_SSL_CA` set | MITM on DB link | P1-14 |

## Operational requirements for production

- `NODE_ENV=production`, `TRUST_PROXY` set, `COOKIE_DOMAIN` set for subdomain tenancy.
- `DB_SSL=true` with `DB_SSL_CA`; Redis with auth and TLS.
- `KEYRING_MASTER_KEY`, `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`, `SESSION_SECRET` from a secret
  manager; rotate on personnel change. Rotating `KEYRING_MASTER_KEY` requires re-encrypting
  `key_pairs` (no tooling yet).
- Never set `SEED_*` or `DISABLE_RATE_LIMIT` in production.
- Swagger (`/api-docs`) is disabled automatically in production.

## Audit findings and controls (ASVS L2 pass, 2026-10-20)

Regression tests: `apps/auth-service/test/e2e/security/**` plus unit specs named below.

| Sev | Finding | Location | Status | ASVS |
|---|---|---|---|---|
| Critical | `mfa_pending` token (RS256, same key) accepted as an access token; password-only login reached `JwtAuthGuard`-only routes (`/mfa/*` incl. disable MFA, rbac, webhooks, ldap, scim, saml mgmt) | `common/guards/jwt.strategy.ts` `validate` | Fixed | 2.8, 3.5, 4.1 |
| Critical | Any tenant member could create tenants and set/verify any tenant's custom domain (host takeover) | `modules/tenant/tenant.controller.ts` | Fixed (platform admin only) | 4.1, 4.2 |
| Critical | SAML SSO and `RequestUserGuard` trusted any signed token (incl. `mfa_pending`) as the user identity | `common/guards/token-verification.guard.ts` | Fixed | 2.8, 3.5 |
| High | Social-login `return_url` checked with `startsWith`; completion token leaked to attacker origin | `social-auth.controller.ts`, `common/security/return-origin.ts` | Fixed | 5.1.5 |
| High | Magic link skipped an enrolled MFA factor | `auth.service.ts` `verifyMagicLink` | Fixed (returns `mfaRequired`) | 2.8 |
| High | Suspended (`isActive=false`) users could log in with a password | `auth.service.ts` `login` | Fixed | 2.1, 3.3 |
| High | Invite let `users:write` grant any role (escalation) | `user.service.ts` `inviteUser` | Fixed (hierarchy + tenant-owned roles) | 4.1.3 |
| High | `createClient` body `tenantId` overrode request tenant | `oauth.controller.ts` | Fixed | 4.2 |
| High | Management routes skipped `SessionGuard` (revoked sessions valid 15 min) | oauth/saml/scim/webhook/ldap/mfa/rbac controllers | Fixed | 3.3, 3.7 |
| Medium | Token endpoint ignored client `grant_types` | `oauth.controller.ts` | Fixed | 10.x |
| Medium | SSRF deny-list missed CGNAT, 0/8, hex-mapped IPv6, multicast; pinned lookup forced IPv4 | `common/security/private-ip.ts`, `webhook.*` | Fixed | 12.6 |
| Medium | LDAP API returned `bindPasswordEncrypted`; LDAP host could target loopback/metadata | `ldap.controller.ts`, `ldap.service.ts` | Fixed | 8.3, 12.6 |
| Medium | GCM auth tag length not enforced on decrypt | `oauth-token-encryption.service.ts`, `ldap.service.ts`, `packages/security` | Fixed | 6.2 |
| Medium | No log redaction; `Math.random` in `PasswordService.generate` | `common/logger.ts`, `packages/security` | Fixed | 7.1, 6.3 |
| Medium | Social login `state` unsigned and not browser-bound (login CSRF) | `social-auth/social-state.ts` (HMAC + single-use nonce cookie, 10 min TTL) | Fixed | 3.5, 4.2 |
| Medium | CORS allow-list is global: any OAuth client admin can add an https origin accepted for every tenant | `core/cors-refresh.service.ts` | Open (decision) | 14.5 |
| Medium | Invite and email-verification tokens stored in plaintext | `common/security/token-hash.ts`; migration `1940000000000-HashInviteAndVerificationTokens` backfills all `fk_*` schemas (emailed links keep working) | Fixed | 2.5, 6.x |
| Medium | LDAP host may still target private ranges (needed for on-prem directories) | `ldap.service.ts` | Open (decision) | 12.6 |
| Low | `GET /email/test` reachable outside production | `email.controller.ts` (only `NODE_ENV=development`, rate limited) | Fixed | 14.1 |
| Low | SAML SSO identity check does not consult session revocation | `saml.controller.ts` | Open | 3.3 |
| Low | `ValidationPipe` lacks `forbidNonWhitelisted` (extra fields are stripped, not rejected) | `core/configure-app.ts` | Open | 5.1 |
| Low | Webhook secrets stored plaintext (needed for HMAC); AES-GCM uses 128-bit IV and no key id | `webhook.service.ts`, `packages/security` | Open | 6.2 |
| Info | `yarn npm audit --severity high` reports advisories (e.g. `next` 16.0.1, GHSA-cjq9-62q9-8jv4); report only | root lockfile | Open | 14.2 |

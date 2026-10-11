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

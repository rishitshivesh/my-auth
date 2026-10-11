# Remediation plan

Prioritised, verified open work. Item numbers are stable — reference them in commits and PRs
(`fix(auth): … (P0-6)`). Every PR must keep `typecheck`, unit tests and
`scripts/smoke-test.sh` green (CI enforces this).

**Baseline (2026-10-11, branch `chore/foundation-hardening`):** service boots on a fresh
database; 122/122 unit tests; 14/14 end-to-end smoke checks; CI runs both.

Legend: ✅ done · 🔜 open

## Done in the foundation pass

| | Item |
|---|---|
| ✅ | Service failed to boot (DI): global `DatabaseModule`; single TypeORM root |
| ✅ | Duplicate service instances (Redis ×7, JWKS ×3, RBAC cache ×2): `SharedServicesModule` / ADR-0002 |
| ✅ | Env contract contradicted runtime; `.env.example` missing required secrets; no compose file |
| ✅ | Password-reset account takeover (code-only lookup, `Math.random`, no limits, replayable) |
| ✅ | Hard-coded secret on `/api-docs.yaml`; health route required a tenant |
| ✅ | Standard `/.well-known` JWKS + discovery; discovery issuer ≠ token `iss` |
| ✅ | Cookie policy drift across 4 controllers |
| ✅ | 16 failing unit tests; audit metadata leaked secrets nested in arrays |
| ✅ | CI: typecheck, unit tests, boot + e2e smoke |
| ✅ | P0-1 Docs consolidation (this file, README, AGENTS.md, architecture, security, ADRs) |
| ✅ | P0-2 Background jobs run per tenant (`TenantJobRunner`) |
| ✅ | P0-6 Email OTP moved to Redis |
| ✅ | P0-7 PKCE is S256-only and mandatory for public clients |
| ✅ | P0-5 Request bodies validated via class-validator DTOs |
| ✅ | P0-8 ADR-0003 accepted; access tokens removed from all response bodies |
| ✅ | P0-3 SAML SSO wired and assertions signed (XML-DSig via samlify) |
| ✅ | P0-4 Real per-tenant signing keys, scheduled rotation (ADR-0004) |

## P0 — correctness & security

**P0-2 ✅ Background jobs run without tenant context.** Fixed: `TenantJobRunner`
(`core/database`) runs work per active tenant inside a tenant QueryRunner, behind a
cluster-wide advisory lock; hourly token and 15-minute session cleanups use it. Verified live
(expired sessions in `fk_sentry` purged) and by `tenant-job-runner.service.spec`. Any new
background job must use `TenantJobRunner`.

**P0-3 ✅ SAML assertions unsigned; `/saml/sso` not wired.** Fixed: full SP-initiated SSO wired
via `samlify` (XML-DSig; already a listed-but-unused dependency). `/saml/sso/:tenantSlug` and
`/saml/metadata/:tenantSlug` resolve the tenant from the path (reached at a shared hostname, not
subdomain/header) and schema-scope the eventual user lookup via `TenantJobRunner`. The AuthnRequest
issuer is peeked cheaply, then re-validated against the matching *active* `SamlServiceProvider`
row before any assertion is built; unauthenticated requests are stashed in Redis (one-time nonce,
10-min TTL) and resumed via `GET /saml/sso/continue/:nonce` after login. The authenticated
session's own tenant is checked against the resolved SSO tenant before signing
(`assertSessionTenant`). Since `KeyPair` only stores a bare public key (no real X.509 cert, needed
by both `<ds:X509Certificate>` and samlify's signing pipeline), a self-signed cert wrapping the
same key is generated on the fly (`@peculiar/x509` + WebCrypto) and cached in memory, never
persisted. *AC met:* `saml.service.spec.ts` signs a response, validates it with a reference SP
(`samlify.ServiceProvider.parseLoginResponse`), then tampers one byte and confirms that SP rejects
it.
Post-commit review follow-ups, all fixed: (1) the SSO continuation nonce is now bound to the
initiating browser via a short-lived cookie (`saml_sso_nonce`), closing a login-CSRF path where a
leaked nonce could be completed from a different browser. (2) `getActiveKeyPair()` queried
`status: "active"` with no tenant filter — harmless before P0-4 (only one active key ever
existed), but once P0-4 provisioned a dedicated active key per tenant this picked whichever
tenant's key was created most recently *globally*, so a SAML assertion for tenant A could be
signed with tenant B's key. Now tenant-scoped, with the same platform-key fallback
`JwksService.getCurrentSigningKey` already uses. (Two of this review's findings were initially
lost to a tooling issue — the notification body was truncated before the detail arrived — but
were recovered from the security-guidance plugin's own state file at
`~/.claude/security/security_warnings_state_*.json` and fixed from there.)

**P0-4 ✅ Per-tenant signing keys are not real.** Fixed: ADR-0004 accepted option (a) — generate
at provisioning, scheduled rotation with a grace period. `JwksService.ensureTenantKeyExists`
provisions a tenant's first key at creation (both `admin.service.ts#createTenant` and
self-service `tenant-registration.service.ts`); the new `KeyRotationService` (`@Cron` daily)
rotates keys past `KEY_ACTIVE_TTL_DAYS` (default 90), backfills any tenant missing a key
entirely, and revokes `retired` keys past `KEY_ROTATION_GRACE_DAYS` (default 7). Removed
`JwksService.getJWKS()` as confirmed dead code — both real JWKS endpoints already used the
correct `getVerificationKeys()` (active+retired, tenant-scoped), satisfying that half of the AC
without changes. Security review caught two real gaps, both fixed: the in-memory signing-key
cache was stale across replicas after a rotation (now re-validates against the DB every 5
minutes); a failed self-service registration could orphan an encrypted private-key row (now
cleaned up in the rollback path). Tests: `jwks.service.spec.ts` (11 cases covering provisioning,
rotation, backfill, grace-period verification, and cross-replica cache staleness).

**P0-5 ✅ Request bodies that bypass validation.** Fixed: all ~15 inline-typed `@Body()`
parameters (admin tenant status/featureFlags, SCIM user/group/patch, WebAuthn register/finish,
social claim `{ ct }`, dashboard settings) converted to `class-validator` DTOs across
`admin`, `scim`, `auth`, `mfa`, `social-auth` and `dashboard`. WebAuthn `response` blobs stay
`@IsObject()` since `@simplewebauthn/server` does its own structural verification. Tests:
per-DTO `*.dto.spec.ts` files.

**P0-6 ✅ Email OTP stored in process memory.** Fixed: codes live in Redis per tenant + user
(hash only, 10-minute TTL, 5-attempt budget, single use, constant-time compare). Tests:
`email-otp.service.spec` (incl. cross-replica); verified live.

**P0-7 ✅ PKCE `plain` accepted and advertised.** Fixed: authorize accepts only
`code_challenge_method=S256` (explicit, since RFC 7636 defaults to plain), validates challenge
format, and always requires PKCE for public clients; token exchange compares in constant time and
rejects legacy `plain` codes; discovery advertises `["S256"]`. Tests: `oauth-token.pkce.spec`.

**P0-8 ✅ Access token returned in response bodies.** Fixed: ADR-0003 accepted (cookie-only
everywhere, no opt-in header — no in-repo consumer needs bearer delivery). `accessToken` removed
from every first-party auth response body (login, refresh, MFA verify ×2, WebAuthn login,
magic-link verify, social claim-session, first-admin bootstrap); each now returns `expiresIn` and,
where available, non-secret `session` claims (`tenantId`, `tenantSlug`, `groups`) instead.
`@scrolloop/sdk` no longer tracks the token client-side — `isAuthenticated()` reflects session
state, not token possession; `getSessionClaims()` replaces `getTokenClaims()`. Tests:
`packages/sdk-typescript/src/core/state.spec.ts`.

## P1 — reliability & compliance readiness

**P1-9 🔜 Per-request pinned DB connection.** `TenantSchemaMiddleware` holds a pooled
connection for the entire request. Scope the QueryRunner to the unit of work (or schema-qualify
queries) and add pool metrics. *AC:* k6 test at 200 concurrent requests with pool size 20, no
acquisition timeouts.

**P1-10 🔜 Redis cache store compatibility.** `cache-manager-redis-store` targets older
`cache-manager`; v7 is installed. Verify keys land in Redis; migrate to `@keyv/redis`.
*AC:* cached schema lookups visible in Redis.

**P1-11 🔜 `express-session` MemoryStore.** Only the social-login handshake could use it.
Remove it if unused, otherwise back it with Redis. *AC:* no MemoryStore warning in production.

**P1-12 🔜 Schema names built in raw SQL** in `SessionService`, `OAuthRefreshTokenService`,
`SessionGuard` (each re-implements slug→schema). Route through
`TenantSchemaService.getSchemaName()` with identifier quoting; delete the copies.

**P1-13 🔜 Audit & privacy evidence.** Append-only `security_events` (revoke UPDATE/DELETE from
the app role), retention job, GDPR subject export + erasure endpoints, IP pseudonymisation, and a
control-to-evidence matrix in `docs/security.md`.

**P1-14 🔜 DB TLS verification.** Require `DB_SSL_CA` (or `DB_SSL_REJECT_UNAUTHORIZED=true`) in
production; log a startup warning otherwise.

**P1-15 🔜 Rate-limit keys are not tenant-namespaced**; add tenant to the key; add per-account
login throttling independent of IP.

**P1-16 🔜 Code hygiene.** 46 `any` in auth-service, 20 in admin-portal, 4 raw `fetch` in the
portal, 4 `console.*` outside seeders/CLI. The root `package.json` declares app dependencies
(next, react, typeorm, passport…) — move them to the owning workspaces. Rename
`common/midllewares` → `common/middlewares`.

## P2 — product completeness

- **P2-17** Superadmin console UI; verify the invite-accept page; webhook redeliver UI.
- **P2-18** Observability: request IDs, OpenTelemetry traces, Prometheus metrics.
- **P2-19** Admin-portal tests (Playwright: login, MFA, reset, invite); SDK unit tests.
- **P2-20** Release engineering: Dockerfiles (non-root, healthcheck), Helm chart, SDK publishing
  via changesets, Renovate.
- **P2-21** Unit tests for `AuthService.resetPassword` (currently covered live + by smoke).

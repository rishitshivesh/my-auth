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

## P0 — correctness & security

**P0-2 ✅ Background jobs run without tenant context.** Fixed: `TenantJobRunner`
(`core/database`) runs work per active tenant inside a tenant QueryRunner, behind a
cluster-wide advisory lock; hourly token and 15-minute session cleanups use it. Verified live
(expired sessions in `fk_sentry` purged) and by `tenant-job-runner.service.spec`. Any new
background job must use `TenantJobRunner`.

**P0-3 🔜 SAML assertions unsigned; `/saml/sso` not wired** (`saml.service.ts`,
`saml.controller.ts` — `SPRINT_N` markers). Implement XML-DSig with `xml-crypto` using the
tenant signing key; validate AuthnRequest issuer/ACS against the registered SP; wire session
lookup. *AC:* assertion validates in a reference SP (e.g. samltest / `saml2-js` test harness);
tampered assertion rejected.

**P0-4 🔜 Per-tenant signing keys are not real.** `getCurrentSigningKey(tenantId)` falls back to
the platform key and provisioning never creates tenant keys. Write an ADR choosing either
(a) generate at provisioning + scheduled rotation with grace period, or (b) one platform key by
design. For (a): re-introduce `KEY_ACTIVE_TTL_DAYS` / `KEY_ROTATION_GRACE_DAYS`.
*AC:* rotation test — tokens signed before rotation still verify during grace; JWKS lists
active + retired keys.

**P0-5 🔜 Request bodies that bypass validation.** About 15 `@Body()` parameters are typed as
inline objects, `object`, interfaces or bare `string` (admin tenant status/featureFlags, social
provider toggle, WebAuthn register/finish, social claim `{ ct }`, `{ email }` ×2, five
`string` bodies). Convert each to a `class-validator` DTO.
*AC:* `grep` finds no `@Body()` whose type is not a DTO class; invalid payloads return 400.

**P0-6 ✅ Email OTP stored in process memory.** Fixed: codes live in Redis per tenant + user
(hash only, 10-minute TTL, 5-attempt budget, single use, constant-time compare). Tests:
`email-otp.service.spec` (incl. cross-replica); verified live.

**P0-7 ✅ PKCE `plain` accepted and advertised.** Fixed: authorize accepts only
`code_challenge_method=S256` (explicit, since RFC 7636 defaults to plain), validates challenge
format, and always requires PKCE for public clients; token exchange compares in constant time and
rejects legacy `plain` codes; discovery advertises `["S256"]`. Tests: `oauth-token.pkce.spec`.

**P0-8 🔜 Access token returned in response bodies** despite the cookie-only rule. Decide
ADR-0003, then implement. *AC:* first-party portal works with no token in any response body.

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

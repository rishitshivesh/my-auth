# Scrolloop Sentry — Sprint Status

> Last updated: 2026-06-21

---

## Sprint Overview

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Security hardening (CORS, Helmet, logging, secrets, rate limiting) | ✅ Done |
| Sprint 1b | RSA key persistence, JWKS, schema-per-tenant foundation | ✅ Done |
| Sprint 2 | IAM policy engine, schema isolation (3a), SDK scaffolding | ✅ Done |
| Sprint 3 | Bootstrap flow, multi-org, invite system, auth pages | ✅ Done |
| Sprint 4 | SAML IdP, SCIM, LDAP sync, webhook system | 🔄 In Progress |

See `docs/sprints/sprint-{1,1b,2,3}.md` for detailed delivery notes per sprint.

---

## Sprint 1 — Security Hardening ✅

| Item | Status |
|------|--------|
| CORS from `CORS_ORIGINS` env var, Helmet added | ✅ |
| All `console.log` → Pino structured logging | ✅ |
| `SESSION_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET` from env | ✅ |
| OAuth client validation (client_id + Argon2id client_secret) | ✅ |
| `SlidingWindowRateLimiter` (Redis) on all auth endpoints | ✅ |

## Sprint 1b — RSA & Schema Foundation ✅

| Item | Status |
|------|--------|
| RSA key pairs persisted in `key_pairs` table, encrypted at rest | ✅ |
| `GET /.well-known/jwks.json` — public key endpoint, Redis-cached | ✅ |
| `kid` in JWT header for key rotation support | ✅ |
| `TenantSchemaService` — `createSchema()`, `schemaExists()`, `getSchemaName()` | ✅ |
| `TenantResolverMiddleware` — slug from subdomain / header / path | ✅ |

## Sprint 2 — IAM Policy Engine ✅

| Item | Status |
|------|--------|
| Project rename: Fort Knox → Scrolloop Sentry | ✅ |
| `Policy` / `UserPolicy` / `RolePolicy` / `GroupPolicy` entities | ✅ |
| `PolicyEvaluationService` — explicit Deny wins, wildcard, conditions | ✅ |
| `PermissionsGuard` + `@RequirePermissions()` decorator | ✅ |
| `TenantContextService` (AsyncLocalStorage) | ✅ |
| `TenantAwareRepository` (abstract base, schema-scoped EntityManager) | ✅ |
| `TenantSchemaMiddleware` — SET search_path per request, auto-heals | ✅ |
| `UserRepository` extending TenantAwareRepository | ✅ |
| SDK scaffolding: TS, Node, Vue, Angular, Java, Go, Python, Ruby, Rust, Nginx | ✅ |

## Sprint 3 — Bootstrap & Multi-Org ✅

| Item | Status |
|------|--------|
| Platform seeder — sentry-only, reads `SENTRY_PLATFORM_NAME/SLUG` | ✅ |
| Demo seeder split — `npm run db:seed:demo` | ✅ |
| `GET /superadmin/platform-info` — public endpoint | ✅ |
| JWT `tenantSlug` claim on all issued tokens | ✅ |
| `authClient.tenant` — slug (never UUID), `NEXT_PUBLIC_SENTRY_TENANT_SLUG` | ✅ |
| Middleware fail-closed — API down → `/error?reason=api_unavailable` | ✅ |
| Post-login redirect — reads `tenantSlug` from JWT claims | ✅ |
| CLI setup tool — `npm run setup`, interactive, reads `~/.sentry/setup.log` | ✅ |
| `GET /user/orgs` — multi-org memberships | ✅ |
| `TenantSwitcher` component — React Query, real API, wired in Topbar | ✅ |
| `UserInvite` entity + migration (128-char token, expiresAt, roleIds) | ✅ |
| `POST /users/invite` — creates invite, sends SES email | ✅ |
| `GET /auth/invite/validate/:token` | ✅ |
| `POST /auth/invite/accept` — creates user, assigns roles | ✅ |
| Signup page — real `useRegister()` mutation, no mocks | ✅ |
| Verify-email page — auto-verifies `?token=` from URL | ✅ |
| Magic-link page — reads `tenantSlug` from JWT for redirect | ✅ |
| OAuth callback — real `claimSocialSession(ct)`, no fake delay | ✅ |
| Zero `any` types in admin portal | ✅ |

---

## Sprint 4 — Enterprise Protocols 🔄 In Progress

**Focus:** SAML IdP, SCIM provisioning, LDAP sync, webhook system.

### SAML IdP

| Item | Status |
|------|--------|
| `samlify` integration (SP-initiated + IdP-initiated) | 🔄 |
| Per-tenant SAML metadata endpoint | 🔄 |
| ACS (Assertion Consumer Service) endpoint | 🔄 |
| SLO (Single Logout) endpoint | 🔄 |
| SAML config UI (upload IdP metadata, map attributes) | 🔄 |

### SCIM 2.0 Provisioning

| Item | Status |
|------|--------|
| `GET/POST /scim/v2/Users` | 🔄 |
| `GET/PUT/PATCH/DELETE /scim/v2/Users/:id` | 🔄 |
| `GET/POST /scim/v2/Groups` | 🔄 |
| SCIM bearer token per tenant | 🔄 |
| Field mapping (SCIM ↔ Sentry user model) | 🔄 |

### LDAP Sync

| Item | Status |
|------|--------|
| LDAP connection config per tenant (host, port, bindDN, baseDN) | 🔄 |
| BullMQ scheduled sync job | 🔄 |
| User create/update/suspend from LDAP | 🔄 |
| Group→role mapping | 🔄 |

### Webhook System

| Item | Status |
|------|--------|
| `Webhook` entity (url, secret, events[], tenantId) | 🔄 |
| `WebhookDelivery` entity (status, attempts, response) | 🔄 |
| BullMQ delivery queue with exponential retry | 🔄 |
| HMAC-SHA256 signature on payload | 🔄 |
| `POST /webhooks` CRUD endpoints | 🔄 |
| Event types: `user.created`, `user.suspended`, `login.success`, `login.failed`, `mfa.enrolled` | 🔄 |

---

## Open gaps (deferred)

| Item | Target |
|------|--------|
| `SessionRepository` / `RefreshTokenRepository` extending TenantAwareRepository | Sprint 4 |
| Cross-tenant guest membership index (public-schema table) | Sprint 4 |
| Per-tenant migration script (`scripts/migrate-to-schema-per-tenant.ts`) | Sprint 4 |
| Schema isolation verification script | Sprint 4 |
| WebAuthn / passkey enroll UI | Sprint 4 |
| Superadmin console | Sprint 5 |

---

## Running locally

```bash
docker-compose up -d                             # postgres, redis, mailhog

cd apps/auth-service && yarn dev                 # auth service on :4000
cd apps/auth-service && npm run setup            # first-run setup wizard

cd apps/admin-portal && yarn dev                 # portal on :3000

cd apps/auth-service && npm run db:seed:demo     # optional demo data
```

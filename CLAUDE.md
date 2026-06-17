# CLAUDE.md — Scrolloop Sentry

> This file governs how Claude Code operates in this repository.
> Read every line before touching any file.

---

## WHAT IS THIS PROJECT

Scrolloop Sentry is an enterprise authentication platform (Auth0 competitor)
built as part of the Scrolloop product family. It provides multi-tenant auth,
RBAC (AWS IAM-level), user management (Active Directory-level), MFA, social login,
WebAuthn/passkeys, and SDKs for every major language and framework.

**Domain:** sentry.scrolloop.com (primary), scrolloopsentry.io (standalone)
**Parent:** scrolloop.com

---

## MONOREPO STRUCTURE

```
/
├── apps/
│   ├── auth-service/        ← NestJS backend (Auth server, all API endpoints)
│   └── admin-portal/        ← Next.js 15 frontend (Admin UI + user-facing flows)
├── packages/
│   ├── sdk-typescript/      ← Browser + React + Next.js SDK
│   ├── sdk-node/            ← Node.js server SDK (JWT verify, Express/Fastify/NestJS)
│   ├── sdk-vue/             ← Vue 3 composables
│   ├── sdk-angular/         ← Angular module + guards
│   ├── sdk-java/            ← Spring Boot starter
│   ├── sdk-go/              ← Go HTTP middleware
│   ├── sdk-python/          ← Django/FastAPI/Flask
│   ├── sdk-ruby/            ← Rack middleware
│   ├── sdk-rust/            ← Axum/Actix middleware
│   └── sdk-nginx/           ← OpenResty Lua
├── helm/                    ← Kubernetes Helm chart
├── docs/                    ← Developer documentation
│   └── ui/
│       ├── 01-stitch-prompt.md          ← Stitch MCP design system prompt
│       ├── 02-antigravity-ui-prompt.md  ← UI implementation prompt
│       └── 03-ui-generation-process.md  ← Mandatory UI process
└── CLAUDE.md                ← This file
```

---

## TECH STACK

**Backend (auth-service):**
- NestJS 10 + TypeScript
- TypeORM + PostgreSQL (schema-per-tenant: `fk_{slug}`)
- Redis (sessions, rate limiting, JWKS cache)
- Argon2id (password hashing), AES-256-GCM (token encryption)
- RS256 JWT signing with persisted RSA key pairs + real JWKS endpoint
- Passport.js (JWT strategy, social OAuth2, PKCE)
- BullMQ (background jobs)
- Pino (structured logging — NO console.log anywhere)

**Frontend (admin-portal):**
- Next.js 15 (App Router)
- React Query (TanStack Query v5) — ALL data fetching
- Tailwind CSS v4
- shadcn/ui (base primitives, overridden with Sentry tokens)
- Scrolloop Sentry design system (tokens from Stitch MCP)

**SDKs:** TypeScript (primary), Node, Vue, Angular, Java, Go, Python, Ruby, Rust, Nginx

---

## CRITICAL RULES

### 1. UI WORK — ALWAYS CALL STITCH MCP FIRST

Before writing ANY frontend component or page:

```
1. Connect to Stitch MCP server
2. Call stitch.getDesignSystem({ name: "scrolloop-sentry" })
   OR stitch.getComponent({ name: "[ComponentName]" })
3. Extract all token values
4. Reference those values in your implementation
5. NEVER invent colors, spacing, or font sizes
```

See `docs/ui/03-ui-generation-process.md` for the full process.

### 2. BACKEND IS SEPARATE FROM UI

When doing UI work: **do not touch any backend file.**
When doing backend work: **do not touch any frontend file.**

UI files: `apps/admin-portal/**`, `packages/sdk-typescript/src/react/**`
Backend files: everything else

### 3. ZERO CONSOLE.LOG

Use the structured Pino logger in the backend (`this.logger` in NestJS services).
Use no logging in the frontend (React Query handles errors; surface them in UI).
If you see a console.log, remove it.

### 4. ZERO STUBS

If an endpoint is not implemented, throw `NotImplementedException`.
Never return fake success responses. Never return hardcoded mock data.
Comment with `// SPRINT_N:` if intentionally deferred.

### 5. ZERO HARDCODED VALUES

All config comes from environment variables.
See `apps/auth-service/src/config/env.validation.ts` for the full list.
All env vars must be in `.env.example` with descriptions.

### 6. ZERO `any` TYPES

TypeScript `any` is forbidden. If you don't know the type, define it.
Run `tsc --noEmit` before committing.

---

## DESIGN SYSTEM

**Name:** Scrolloop Sentry Design System
**Source of truth:** Stitch (via MCP)
**Implementation:** `apps/admin-portal/app/globals.css` + `tailwind.config.ts`

### Visual direction:
- Warm off-white base (#F7F6F4), NOT cold dark navy
- Montserrat (light weights) for headings — editorial, luxury
- DM Sans for body — clean, legible
- JetBrains Mono for all technical values (tokens, IDs, code)
- Frosted glass cards (backdrop-filter: blur) — everything floats
- Mint green (#2ABF6C) as the ONLY accent — used once per screen
- Rounded: 16–28px radii — Apple/iPadOS energy
- Animations: slow, ease, never bounce

### Color tokens (light theme):
```css
--color-bg-base:     #F7F6F4
--color-surface-1:   rgba(255,255,255,0.68)   /* glass tier 1 */
--color-surface-2:   rgba(255,255,255,0.80)   /* glass tier 2 */
--color-surface-3:   rgba(255,255,255,0.92)   /* glass tier 3 */
--color-text-primary:    #1A1916
--color-text-secondary:  #4A4845
--color-text-tertiary:   #8A8784
--color-accent:          #2ABF6C
--color-accent-soft:     rgba(42,191,108,0.10)
--color-accent-dark:     #1D8F50
--color-danger:          #C0392B
--color-warning:         #C4830A
--color-info:            #2563EB
```

---

## ARCHITECTURE DECISIONS (locked)

| Decision | Choice | Reason |
|----------|--------|--------|
| JWT algorithm | RS256 | External verification, per-tenant keys |
| Tenant isolation | Schema-per-tenant (fk_{slug}) | Strong isolation |
| Deployment | SaaS + self-hosted (Docker + Helm) | Enterprise requirement |
| Password hashing | Argon2id | Industry best practice |
| Token encryption | AES-256-GCM | Encrypt stored OAuth tokens |
| Session storage | PostgreSQL + Redis dual-layer | Persistence + performance |
| Rate limiting | SlidingWindowRateLimiter (Redis) | Accurate, atomic |
| Compliance | SOC 2 Type II + GDPR | From day one |
| Enterprise protocols | SAML IdP + OIDC + LDAP sync | Full enterprise |
| SDK priority | All languages scaffolded in parallel | Ship together |

---

## DATABASE

**Primary DB:** PostgreSQL 16
**Schema model:** Schema-per-tenant

Platform-level entities (in `public` schema):
- `tenants` — all tenants
- `key_pairs` — RSA signing keys
- `admin_users` — superadmin accounts

Per-tenant entities (in `fk_{slug}` schema):
- `users`, `sessions`, `refresh_tokens`, `mfa_configs`, `backup_codes`
- `oauth_clients`, `oauth_tokens`, `webauthn_credentials`
- `roles`, `permissions`, `user_roles`, `policies`, `groups`
- `audit_logs`, `security_events`, `user_invites`, `password_history`
- `tenant_password_policy`

**IMPORTANT:** All TypeORM queries touching tenant data must operate within
the correct schema. The `TenantSchemaMiddleware` sets `search_path` per request.

---

## Tenant Isolation Architecture

TWO layers of isolation are now active simultaneously (defense-in-depth):

### Layer 1: Schema-level (search_path)
`TenantSchemaMiddleware` runs on every tenant request after `TenantResolverMiddleware`.
It acquires a connection from the TypeORM pool and executes:
```sql
SET search_path TO "fk_{slug}", public
```
This routes ALL TypeORM queries for this request to the correct tenant schema.
The connection is returned to the pool after the response completes,
with `search_path` reset to `public`.

The `QueryRunner` is stored in `AsyncLocalStorage` via `TenantContextService`.
Services use `TenantAwareRepository` which reads from `TenantContextService`
instead of the default DataSource pool.

### Layer 2: Row-level (tenant_id column)
All entities retain their `tenant_id` columns.
All services retain their `WHERE tenant_id = ?` clauses, marked:
```typescript
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed
```
This is defense-in-depth — a bug in Layer 1 does not expose Layer 2.

### Request lifecycle:
1. `TenantResolverMiddleware` → resolves slug from hostname/header → `req.tenant`
2. `TenantSchemaMiddleware`  → sets `search_path` → stores in `AsyncLocalStorage`
3. Guards run              → `TenantBindingGuard` validates JWT vs `req.tenant`
4. Controller/Service      → `TenantAwareRepository` uses scoped `EntityManager`
5. Response sent           → `search_path` reset, `QueryRunner` released

### Platform routes (excluded from TenantSchemaMiddleware):
- `GET /health`
- `GET /.well-known/*`
- `ALL /superadmin/*`

These routes operate on the public schema (platform-level data).

### Key files:
- `apps/auth-service/src/core/database/tenant-context.service.ts` — AsyncLocalStorage
- `apps/auth-service/src/core/database/tenant-aware.repository.ts` — base repository
- `apps/auth-service/src/common/midllewares/tenant-schema.middleware.ts` — sets search_path
- `apps/auth-service/src/modules/user/user.repository.ts` — proof of concept (Sprint 3a)

---

## AUTHENTICATION FLOWS

### Login (password):
1. `POST /api/auth/login` → brute force check → password verify → issue `mfa_pending` temp token (if MFA enrolled)
2. `POST /api/auth/mfa/verify` → TOTP/backup/WebAuthn verify → issue full JWT (RS256, kid in header)
3. JWT stored as httpOnly cookie, refresh token in DB + Redis

### Token lifecycle:
- Access token: 15 minutes (RS256)
- Refresh token: 7 days, rotation with family reuse detection
- Refresh token family revoked on reuse attack detection

### JWT payload:
```json
{ "sub": "userId", "tid": "tenantId", "sid": "sessionId",
  "jti": "uuid", "iss": "https://sentry.scrolloop.com/t/{slug}",
  "aud": "clientId", "iat": 0, "exp": 0 }
```

---

## API STRUCTURE

All auth endpoints: `apps/auth-service/src/modules/`

```
auth/          → login, register, logout, refresh, magic-link, password reset
mfa/           → TOTP setup/verify, WebAuthn, backup codes
oauth/         → authorization, token, revoke, introspect, JWKS
user/          → profile, password change, sessions, admin user management
tenant/        → tenant CRUD, config, password policy
rbac/          → roles, permissions, policies, groups
social-auth/   → Google, GitHub, Microsoft OAuth flows
audit/         → audit log queries, GDPR export
```

---

## SCREENS INVENTORY

| Screen | Route | Status | Stitch Frame |
|--------|-------|--------|--------------|
| Login | /u/login | ✅ exists, needs UI upgrade | u/login |
| Register | /u/signup | ⚠️ mock only | u/signup |
| Verify email | /u/verify-email | ⚠️ mock only | u/verify-email |
| Forgot password | /u/forgot-password | ⚠️ exists | u/forgot-password |
| Dashboard | /t/[slug] | ⚠️ mock data | t/dashboard |
| Users list | /t/[slug]/users | ⚠️ partial | t/users |
| User detail | /t/[slug]/users/[id] | ❌ missing | t/user-detail |
| RBAC | /t/[slug]/roles | ❌ missing | t/rbac |
| API Clients | /t/[slug]/clients | ❌ missing | t/clients |
| Settings | /t/[slug]/settings | ⚠️ partial | t/settings |
| Audit Log | /t/[slug]/audit | ❌ missing | t/audit |
| MFA Enroll | /mfa/enroll | ❌ missing | mfa/enroll |
| Invite Accept | /invite/[token] | ❌ missing | invite/accept |
| Superadmin | /superadmin | ❌ missing | superadmin/console |

✅ = done and wired | ⚠️ = exists but needs work | ❌ = missing entirely

---

## SPRINT STATUS

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Security hardening (CORS, Helmet, console.log, session secret, OAuth client validation) | ✅ Done |
| Sprint 1b | RSA key persistence, schema-per-tenant foundations, rate limiting | ✅ Done |
| Sprint 2 | IAM policy engine (full Deny/Allow), schema migration, SDK scaffolding | 🔜 Next |
| Sprint 3 | Frontend UI upgrade (all screens), Stitch design system wired | 🔜 Planned |
| Sprint 4 | SAML IdP, SCIM, LDAP sync, webhook system | 🔜 Planned |

---

## BEFORE YOU COMMIT

Run these checks:

```bash
# Type check
cd apps/auth-service && npx tsc --noEmit
cd apps/admin-portal && npx tsc --noEmit

# Lint
yarn lint

# Search for console.log (there should be zero in non-seeder files)
grep -r "console\." apps/auth-service/src --include="*.ts" \
  --exclude-path="*/seeder/*"

# Search for hardcoded hex colors in components
grep -r "#[0-9A-Fa-f]\{3,6\}" apps/admin-portal/components --include="*.tsx"
# (output should be empty — all colors via CSS vars)

# Search for 'any' type
grep -r ": any" apps/auth-service/src --include="*.ts"
```

---

## ENVIRONMENT VARIABLES

See `.env.example` for the full list with descriptions.

Required for local dev:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scrolloop_sentry
REDIS_URL=redis://:password@localhost:6379
MASTER_ENCRYPTION_KEY=<32+ random bytes, base64>
SESSION_SECRET=<32+ random bytes, base64>
FORT_KNOX_BASE_URL=http://localhost:3001
GDPR_IP_SALT=<32+ random bytes, base64>
CORS_ORIGINS=http://localhost:3000
SMTP_HOST=localhost
SMTP_PORT=1025
```

Run local stack: `docker-compose up -d` (starts postgres, redis, mailhog)

---

## CONTACTS & OWNERSHIP

- **Architecture:** Rishit (CTO)
- **Design system:** Stitch MCP → Scrolloop Sentry design system
- **Repo:** github.com/rishitshivesh/my-auth (rename to scrolloop-sentry pending)

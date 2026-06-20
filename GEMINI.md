# GEMINI.md — Scrolloop Sentry

> This file governs how Gemini CLI and Gemini-based agents operate in this repository.
> Read every section before executing any task. This mirrors CLAUDE.md with
> Gemini-specific tooling notes.

---

## WHAT IS THIS PROJECT

Scrolloop Sentry is an enterprise authentication platform (Auth0 competitor),
part of the Scrolloop product family. Multi-tenant auth, IAM-level RBAC,
Active Directory-level user management, MFA, social login, WebAuthn, and SDKs
for every major language.

**Domain:** sentry.scrolloop.com
**Codebase:** NestJS backend + Next.js 15 admin portal + 9 language SDKs

---

## MONOREPO STRUCTURE

```
apps/auth-service/     ← NestJS 10 backend (all API logic lives here)
apps/admin-portal/     ← Next.js 15 frontend (all UI lives here)
packages/sdk-*/        ← Multi-language SDKs
helm/                  ← Kubernetes deployment charts
docs/ui/               ← UI design process documentation
```

Full structure is in CLAUDE.md. Reference that for the complete map.

---

## GEMINI-SPECIFIC TOOL USAGE

### Stitch MCP (MANDATORY for all UI work)

Gemini must use the Stitch MCP tool before any frontend work.
This is non-negotiable. The Stitch design system is the source of truth for
ALL colors, spacing, typography, and component specifications.

```
Tool: stitch
Method: getDesignSystem
Args: { name: "scrolloop-sentry" }
```

If you do not have access to the Stitch MCP tool:
1. Stop. Do not proceed with UI work.
2. Report: "Stitch MCP not available — cannot implement UI without design tokens."
3. You MAY proceed with backend-only tasks while MCP is unavailable.

### File reading before editing

Always read a file fully before editing it. Use the file reading tool.
Do not assume you know the current content of any file.

### Shell commands

Before running any shell command, state what it does and why.
Never run `rm -rf`, `DROP TABLE`, `DROP SCHEMA`, or any destructive command
without explicit confirmation from the user.

---

## CRITICAL RULES (same as CLAUDE.md — enforced here too)

### Rule 1: UI work → call Stitch MCP first

```
STEP 1: Call stitch.getDesignSystem({ name: "scrolloop-sentry" })
STEP 2: Extract all CSS variable values from the response
STEP 3: Reference those values in every component you write
STEP 4: Only then begin implementation
```

See `docs/ui/03-ui-generation-process.md` for the complete process.

### Rule 2: Strict separation — UI vs backend

**Doing UI work?** Touch ONLY:
```
apps/admin-portal/**
packages/sdk-typescript/src/react/**  (only React hooks/provider UI)
```

**Doing backend work?** Touch ONLY:
```
apps/auth-service/**
packages/sdk-*/  (non-React SDK packages)
```

Never cross this boundary in a single task.

### Rule 3: Zero console.log

Backend: use Pino logger via `this.logger` in NestJS services.
Frontend: surface errors in UI, do not log them.
Before committing: `grep -r "console\." apps/ --include="*.ts" --include="*.tsx"`
Output must be empty (except seeder scripts).

### Rule 4: Zero stubs

Unimplemented features: throw `NotImplementedException` from NestJS.
Never return `{ message: "Done" }` for operations that aren't done.
Mark deferred work with `// SPRINT_N: description` comment.

### Rule 5: Zero hardcoded values

Config lives in `.env` files. All vars validated at startup via `env.validation.ts`.
No hardcoded URLs, secrets, tenant IDs, or credentials in any code.

### Rule 6: No raw design values in components

```tsx
// WRONG
<div style={{ color: '#2ABF6C', borderRadius: '16px' }}>

// CORRECT
<div className="text-accent rounded-md">

// ALSO CORRECT (when Tailwind class doesn't exist)
<div style={{ color: 'var(--color-accent)', borderRadius: 'var(--radius-md)' }}>
```

---

## DESIGN SYSTEM QUICK REFERENCE

**Source:** Stitch MCP — always fetch fresh, do not rely on memory

**Visual identity:**
- Warm off-white base (#F7F6F4) — NOT pure white, NOT dark navy
- Montserrat (300, 400, 600, 700, 800) — headings, labels, UI
- DM Sans (400, 500) — body text
- JetBrains Mono (400) — API keys, IDs, code, technical values
- Mint green (#2ABF6C) — ONLY accent, used ONCE per screen
- Frosted glass cards — backdrop-filter: blur(20–32px)
- Radius: 10px (sm) / 16px (md) / 22px (lg) / 28px (xl)
- Animations: cubic-bezier(0.4, 0, 0.2, 1), slow, never bounce

**Glass surface specs:**
```css
/* Tier 1 — standard cards */
background: rgba(255,255,255,0.68);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.55);

/* Tier 2 — modals, login card */
background: rgba(255,255,255,0.80);
backdrop-filter: blur(28px);
border: 1px solid rgba(255,255,255,0.60);

/* Tier 3 — overlays */
background: rgba(255,255,255,0.92);
backdrop-filter: blur(32px);
border: 1px solid rgba(255,255,255,0.70);
```

---

## COMPONENT LIBRARY MAP

All UI components live in `apps/admin-portal/components/ui/`.
Match these EXACT names when implementing — they correspond to Stitch frames.

| Component | Purpose | Stitch frame |
|-----------|---------|--------------|
| GlassCard | Container (3 tiers) | GlassCard |
| SentryButton | All buttons (5 variants) | SentryButton |
| SentryInput | Form inputs with label + error | SentryInput |
| NavItem | Sidebar navigation item | NavItem |
| StatusBadge | User/event status chips | StatusBadge |
| TokenDisplay | API keys, masked with copy | TokenDisplay |
| AuditTimeline | Vertical event timeline | AuditTimeline |
| PageHeader | Page title + action slot | PageHeader |
| DataTable | Table with pagination, bulk | DataTable |
| EmptyState | Empty list placeholder | EmptyState |
| Skeleton | Loading shimmer | Skeleton |
| ThemeToggle | Light/dark switch | ThemeToggle |

---

## SCREEN STATUS

| Screen | Route | Status |
|--------|-------|--------|
| Login | /u/login | ⚠️ needs UI upgrade |
| Register | /u/signup | ⚠️ mock only |
| Verify email | /u/verify-email | ⚠️ mock only |
| Forgot password | /u/forgot-password | ⚠️ exists |
| Dashboard | /t/[slug] | ⚠️ mock data |
| Users list | /t/[slug]/users | ⚠️ partial |
| User detail | /t/[slug]/users/[id] | ❌ create |
| RBAC | /t/[slug]/roles | ❌ create |
| API Clients | /t/[slug]/clients | ❌ create |
| Settings | /t/[slug]/settings | ⚠️ partial |
| Audit Log | /t/[slug]/audit | ❌ create |
| MFA Enroll | /mfa/enroll | ❌ create |
| Invite Accept | /invite/[token] | ❌ create |
| Superadmin | /superadmin | ❌ create |

---

## DATABASE ARCHITECTURE

**Schema-per-tenant.** Each tenant gets its own PostgreSQL schema: `fk_{slug}`.

Platform schema (`public`): tenants, key_pairs, admin_users
Tenant schemas (`fk_{slug}`): everything else (users, sessions, roles, etc.)

### Two-Layer Tenant Isolation (defense-in-depth)

**Layer 1 — Schema-level (search_path):**
`TenantSchemaMiddleware` acquires a `QueryRunner` and runs:
```sql
SET search_path TO "fk_{slug}", public
```
The `QueryRunner` is stored in `AsyncLocalStorage` via `TenantContextService`.
`TenantAwareRepository` reads from this scoped `EntityManager`.
`search_path` is reset to `public` and the `QueryRunner` is released after the response.

**Layer 2 — Row-level (tenant_id column):**
All entity queries retain `WHERE tenant_id = ?` clauses, marked:
```typescript
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed
```
Do NOT remove these comments or clauses — they are intentional double-protection.

**Request lifecycle:**
1. `TenantResolverMiddleware` → resolves `req.tenant` from hostname/header
2. `TenantSchemaMiddleware` → sets `search_path`, stores `QueryRunner` in `AsyncLocalStorage`
3. Guards → validate JWT against `req.tenant`
4. Services → use `TenantAwareRepository` (reads scoped `EntityManager`)
5. Response → cleanup: reset `search_path`, release `QueryRunner`

**Platform routes excluded from schema middleware:** `/health`, `/.well-known/*`, `/superadmin/*`

**Key files:**
- `apps/auth-service/src/core/database/tenant-context.service.ts`
- `apps/auth-service/src/core/database/tenant-aware.repository.ts`
- `apps/auth-service/src/common/midllewares/tenant-schema.middleware.ts`

**Do not write raw SQL** unless in a migration file. Use TypeORM QueryBuilder.
**Do not drop schemas** without explicit user confirmation.

---

## JWT & AUTH ARCHITECTURE

- **Algorithm:** RS256 (not HS256)
- **Keys:** RSA-2048 key pairs stored in `public.key_pairs`, encrypted at rest
- **JWKS:** `GET /.well-known/jwks.json` — returns real public keys, not hardcoded
- **Access token TTL:** 15 minutes (env: `ACCESS_TOKEN_TTL`)
- **Refresh token TTL:** 7 days (env: `REFRESH_TOKEN_TTL`)
- **kid:** Always in JWT header — enables key rotation without breaking existing tokens
- **MFA gate:** JWT is NEVER issued before MFA is verified — `mfa_pending` temp token used

---

## SPRINT STATUS

| Sprint | Status | Branch |
|--------|--------|--------|
| Sprint 1: Security hardening | ✅ Complete | main |
| Sprint 1b: RSA keys + schema foundations + rate limiting | ✅ Complete | main |
| Sprint 2: IAM policy engine + full schema migration | 🔜 Next | sprint/2-rbac |
| Sprint 3: Full UI (Stitch-driven) | 🔜 Planned | sprint/3-ui |
| Sprint 4: SAML + SCIM + LDAP | 🔜 Planned | sprint/4-enterprise |

---

## BEFORE YOU COMMIT

```bash
# Type check both apps
npx tsc --noEmit -p apps/auth-service/tsconfig.json
npx tsc --noEmit -p apps/admin-portal/tsconfig.json

# No console.log in production code
grep -r "console\." apps/auth-service/src --include="*.ts" | grep -v seeder
grep -r "console\." apps/admin-portal --include="*.tsx" --include="*.ts"

# No raw hex in components (should return empty)
grep -rn "#[0-9A-Fa-f]\{3,6\}" apps/admin-portal/components --include="*.tsx"

# No 'any' types
grep -rn ": any" apps/auth-service/src --include="*.ts"
grep -rn ": any" apps/admin-portal --include="*.tsx"

# Lint
yarn lint
```

---

## ENVIRONMENT SETUP (local dev)

```bash
# Start infrastructure
docker-compose up -d

# Install deps
yarn install

# Start both apps
yarn dev

# Admin portal: http://localhost:3000
# Auth service: http://localhost:3001
# Mailhog (local email): http://localhost:8025
```

All required env vars are in `.env.example`.
Copy to `.env.local` and fill in values before running.

---

## DOCS MAINTENANCE

**Location:** `apps/docs/` — Fumadocs site at port 3001.
**Source of truth for docs content:** `apps/docs/content/docs/`

After ANY of the following changes, update the relevant docs page before closing the task:

| Change type | Update this doc |
|-------------|-----------------|
| New or changed API endpoint | `apps/docs/content/docs/api/<section>.mdx` |
| New env variable | `apps/docs/content/docs/setup/env.mdx` |
| New authentication flow | `apps/docs/content/docs/auth-flows/` |
| RBAC / policy engine change | `apps/docs/content/docs/rbac/` |
| SDK new feature or breaking change | `apps/docs/content/docs/sdks/<lang>.mdx` |
| Architecture change | `apps/docs/content/docs/architecture/` |
| Setup / first-run change | `apps/docs/content/docs/setup/index.mdx` |

**API signatures format** (use consistently in MDX files):
```
### POST /api/auth/login

**Headers:** Content-Type: application/json, x-tenant-id: <slug>

**Body:** { email: string, password: string }

**Response 200:** { accessToken, refreshToken, user }
**Response 403:** Invalid credentials
```

Do NOT skip the docs update even for small changes.

---

## QUESTIONS / AMBIGUITY

If a task is ambiguous about whether it's UI or backend work, ask.
If the Stitch design system token doesn't exist for something you need, ask.
If an API endpoint doesn't exist that you need for a UI screen, ask — don't create it.

When in doubt: do less, not more. Report what you would do, get confirmation.

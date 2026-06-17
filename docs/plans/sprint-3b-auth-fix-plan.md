# Plan: Fix E2E Auth Flow, CORS, and First-Run Setup

## Context

The entire E2E auth and admin portal flow is broken across five distinct areas:

1. **OAuth login unreachable** — `SentryAuthFlow.tsx` gates social login buttons behind email submission. `LoginIntentRequestDto.email` is `@IsNotEmpty()`, so you must enter an email before OAuth buttons render. Direct social login is impossible.
2. **No provider discovery API** — There is no endpoint for the frontend to ask "which social providers does this tenant/client have enabled?" The frontend hardcodes nothing; it just calls the intent endpoint and blindly shows whatever the backend sends — but the intent endpoint was never designed to drive provider visibility.
3. **CORS is static** — `app.module.ts` reads `CORS_ORIGINS` from env once at startup. There is no per-tenant CORS. OAuth clients *do* have `allowedOrigins` in their entity, but nothing reads them for CORS validation.
4. **Seeder is broken** — `oauth.seed.ts` has a hardcoded `tenantId: "your-tenant-id-here"` TODO. No superadmin user is ever created. The admin portal OAuth client (client 0) is never seeded. There is no `db:reset` script and no setup documentation.
5. **First-run flow missing** — The onboarding UI (`/onboarding/create-tenant`) just `console.log`s and never calls the backend. There is no mechanism to detect "no superadmin exists → redirect to setup".

---

## Task 1: Complete Seeding + Reset Script

### 1a. Fix `oauth.seed.ts`
- Dynamically query `tenant` table for the `sentry` slug before inserting clients
- Remove the hardcoded `"your-tenant-id-here"` TODO
- Create three clients:
  - **Client 0 — Sentry Admin Portal** (`sentry_admin_portal`): `public` grant, PKCE required, `allowedOrigins: ["http://localhost:3000", "https://admin.sentry.scrolloop.com"]`
  - **Client 1 — Sentry Backend Service** (`sentry_backend`): `confidential`, `client_credentials` only
  - Output the generated client_secret for client 1 to stdout so the operator can copy it to `.env`
- Wire `oauth.seed.ts` into `run-seeds.ts` (it's not called today)

### 1b. Create first superadmin user in seed
- In `tenants.seed.ts` (or a new `superadmin.seed.ts`), read `SEED_SUPERADMIN_EMAIL` and `SEED_SUPERADMIN_PASSWORD` from env
- If set: hash password with argon2id, create user in the `sentry` tenant schema, assign `sentry-internal` role AND `Owner` role
- If not set: print a warning "SEED_SUPERADMIN_EMAIL not set — no superadmin created"
- Use `UserRepository`/`TypeORM` directly (same pattern as `tenants.seed.ts`)

### 1c. Add npm scripts
In `apps/auth-service/package.json`:
```
"db:seed": "ts-node -r tsconfig-paths/register src/database/seeders/run-seeds.ts"
"db:reset": "npm run db:drop && npm run db:migrate && npm run db:seed"
```
Add `.env.example` entries: `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`

### 1d. Write `docs/SETUP.md`
Document exactly what to do from a fresh clone to a running system:
- Prerequisites (postgres, redis, node)
- Copy `.env.example` → `.env`, fill in required vars
- `docker-compose up -d`
- `cd apps/auth-service && npm run db:reset`
- What the seed creates, what the SEED_SUPERADMIN_* vars do
- How to log in for the first time
- What NOT to do (don't run `db:drop` on prod, don't commit `.env`, etc.)

---

## Task 2: Per-Tenant CORS

### 2a. Add `allowed_origins` to Tenant entity
- `packages/database/src/entities/tenant.entity.ts`: add `@Column({ type: 'simple-array', nullable: true, name: 'allowed_origins' }) allowedOrigins?: string[]`
- Generate migration: `1790000000000-AddTenantAllowedOrigins.ts`
- Update tenant seeder: set `allowedOrigins: ['http://localhost:3000', 'https://admin.sentry.scrolloop.com']` for the `sentry` tenant

### 2b. Dynamic CORS in `app.module.ts`
Replace the static `parseCorsOrigins()` + fixed `allowedOrigins` with a dynamic callback:

```typescript
// On startup: load all tenant allowed_origins + all oauth_client allowed_origins into a Set
// Cache this Set, refresh every 60s via setInterval
// On each CORS request: check Set first (fast path), fall back to env-var list
```

Concrete steps:
- After `AppDataSource.initialize()` (or in `AppModule.onModuleInit()`), run:
  ```sql
  SELECT unnest(allowed_origins) FROM tenants
  UNION
  SELECT unnest(allowed_origins) FROM oauth_clients
  ```
- Store result in a module-level `Set<string>`
- `app.enableCors({ origin: (origin, cb) => { if (!origin || allowedSet.has(origin) || staticList.includes(origin)) cb(null, true); else cb(new Error('CORS blocked')); } })`
- Refresh the set every 60 seconds
- Expose `POST /superadmin/cors/reload` to force-refresh without restart

### 2c. Update Tenant service
- Add `allowedOrigins` to `CreateTenantDto` and `UpdateTenantDto`
- On tenant update, trigger a CORS set refresh (emit event or call refresh function directly)

---

## Task 3: OAuth Provider Discovery API

Add `GET /auth/providers` (public, no auth required):

**Request:** `?tenant_id=xxx` OR resolved from `X-Tenant-Slug` header (same pattern as other public endpoints)

**Response:**
```json
{
  "password": true,
  "magicLink": true,
  "passkey": false,
  "social": [
    { "provider": "google", "enabled": true },
    { "provider": "github", "enabled": false }
  ]
}
```

**Implementation:**
- New method `AuthService.getProviders(tenantId)` 
- Queries tenant settings/feature flags for passwordless/social enabled state
- Queries `tenant_social_providers` table (already exists from migration `1767021827595-added-social-provider.ts`) for which providers are configured
- No DTO validation issues — doesn't require email
- Add to `AuthController` with `@Public()` decorator
- Add to `docs/` API reference

---

## Task 4: Fix Login UX — OAuth Not Gated Behind Email

### 4a. Backend: make `login-intent` email truly optional for provider-only flows
- The `/auth/login-intent` endpoint can stay email-required for the email path
- No backend change needed for OAuth — OAuth already bypasses it entirely (direct redirect to `/auth/social/google/login`)

### 4b. Frontend: show social buttons immediately on first screen
File: `apps/admin-portal/components/auth/SentryAuthFlow.tsx`

Current flow (broken):
```
[Step 1: enter email] → [Step 2: show password + social buttons]
```

Fixed flow:
```
[Step 1: social buttons (top) + email input (below)] → [Step 2: show password/magic-link for email]
```

Concrete changes:
- Add a new `useProviders(tenantSlug)` hook that calls `GET /auth/providers`
- Render social buttons in the initial view (before any email entry) using data from `useProviders`
- Social button click → calls existing `initiateSocialLogin(provider)` directly, no email needed
- Email entry below social buttons (same UX as Clerk/Auth0)
- When user submits email → call intent endpoint → show email-specific methods (password / magic link / passkey)
- Remove the `step === 'intent'` gate that was hiding social buttons

### 4c. Frontend: fix auth callback redirect
File: `apps/admin-portal/app/u/auth/callback/page.tsx`
- Currently redirects to `/dashboard` which may not exist for the tenant
- Fix: redirect to `/t/${tenantSlug}/dashboard` using tenant slug from the JWT claims after `claimSocialSession`

---

## Task 5: First-Run Detection & Setup UI

### 5a. Backend: `GET /superadmin/initialized`
- Public endpoint (no auth)
- Returns `{ initialized: boolean }` — `true` if ≥1 user with `sentry-internal` role exists
- Used by admin portal to decide whether to show setup page

### 5b. Admin portal middleware: detect uninitialized state
File: `apps/admin-portal/middleware.ts`
- Before auth check on protected routes, call `/superadmin/initialized`
- If `{ initialized: false }`, redirect to `/setup`
- Cache result in a short-lived cookie (5 min) to avoid hammering the API

### 5c. `/setup` page
File: `apps/admin-portal/app/setup/page.tsx` (new)
- Simple form: name, email, password
- On submit: calls `POST /superadmin/create-first-admin` 
- Backend endpoint: only works if `initialized = false`, creates user + assigns `sentry-internal` + `Owner` roles, returns session
- After success: redirect to `/t/sentry/dashboard`
- If system is already initialized: redirect to `/u/login`

### 5d. Backend: `POST /superadmin/create-first-admin`
- Guard: returns `409 Conflict` if any superadmin already exists
- Creates user in `sentry` tenant, hashes password, assigns `sentry-internal` + `Owner` roles
- Issues session + JWT (same as normal login)
- Rate-limited to 5 attempts per IP

---

## Critical Files Modified

| File | Change |
|------|--------|
| `apps/auth-service/src/database/seeders/oauth.seed.ts` | Fix dynamic tenantId lookup, complete client 0 creation |
| `apps/auth-service/src/database/seeders/tenants.seed.ts` | Add superadmin user creation from env vars |
| `apps/auth-service/src/database/seeders/run-seeds.ts` | Wire in oauth.seed |
| `apps/auth-service/package.json` | Add `db:seed`, `db:reset` scripts |
| `packages/database/src/entities/tenant.entity.ts` | Add `allowedOrigins` column |
| `packages/database/src/migrations/` | New migration: `1790000000000-AddTenantAllowedOrigins.ts` |
| `apps/auth-service/src/core/app.module.ts` | Dynamic CORS from DB |
| `apps/auth-service/src/modules/auth/auth.controller.ts` | Add `GET /auth/providers` |
| `apps/auth-service/src/modules/auth/auth.service.ts` | Add `getProviders()` method |
| `apps/auth-service/src/modules/admin/admin.controller.ts` | Add `GET /superadmin/initialized`, `POST /superadmin/create-first-admin` |
| `apps/admin-portal/components/auth/SentryAuthFlow.tsx` | Show social buttons on step 1, not gated |
| `apps/admin-portal/hooks/use-providers.ts` | New hook: fetches enabled providers |
| `apps/admin-portal/app/u/auth/callback/page.tsx` | Fix redirect to correct tenant dashboard |
| `apps/admin-portal/middleware.ts` | Add initialized check → redirect to `/setup` |
| `apps/admin-portal/app/setup/page.tsx` | New: first-run setup page |
| `docs/SETUP.md` | New: complete setup documentation |

---

## Verification

1. **Reset & seed:**  
   `cd apps/auth-service && SEED_SUPERADMIN_EMAIL=admin@example.com SEED_SUPERADMIN_PASSWORD=Test1234! npm run db:reset`  
   → Should complete with no errors, print client secrets to stdout

2. **First-run UI:**  
   Visit `http://localhost:3000` with a fresh DB (no superadmin seeded) → should redirect to `/setup`  
   Fill form → should redirect to `/t/sentry/dashboard`

3. **OAuth login:**  
   Visit `/u/login` → Google button visible immediately (no email required)  
   Click Google → Google OAuth → redirects to `/u/auth/callback?ct=xxx` → redirects to dashboard

4. **CORS:**  
   Confirm `http://localhost:3000` requests are allowed  
   Add a test origin in tenant `allowed_origins`, confirm it's allowed within 60s without restart

5. **Type check:**  
   `cd apps/auth-service && npx tsc --noEmit`  
   `cd apps/admin-portal && npx tsc --noEmit`

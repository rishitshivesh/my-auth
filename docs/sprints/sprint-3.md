# Sprint 3 — Bootstrap, Multi-Org & Invite System

**Status:** ✅ Complete  
**Goal:** Complete the end-to-end new-install flow; add multi-org user membership; build the invite system; fix all auth pages.

---

## Backend changes

### Platform seeder (sentry-only, env-driven)

`apps/auth-service/src/database/seeders/tenants.seed.ts`

- Seeds exactly one tenant: the platform tenant.
- `name` and `slug` read from `SENTRY_PLATFORM_NAME` / `SENTRY_PLATFORM_SLUG` env vars.
- No hardcoded fake tenants (acme, startup, default) in the main seeder.
- Demo data moved to `demo.seed.ts`, run via `npm run db:seed:demo`.

```bash
npm run db:seed        # platform tenant + roles + permissions only
npm run db:seed:demo   # fake orgs for development/demo use
```

### GET /superadmin/platform-info

Public endpoint (no auth required).

```
GET /superadmin/platform-info
→ { slug: "sentry", name: "Scrolloop Sentry", initialized: boolean }
```

Used by the admin portal middleware to check if first-run setup is needed, and by the CLI tool.

### JWT tenantSlug claim

Every issued access token now includes `tenantSlug` in the payload alongside `sub`, `tid`, `sid`, `jti`. The frontend reads this claim to build the post-login redirect URL without an extra API call.

```json
{
  "sub": "user-uuid",
  "tid": "tenant-uuid",
  "tenantSlug": "acme",
  "sid": "session-uuid",
  "jti": "token-uuid",
  "iss": "https://sentry.scrolloop.com/t/acme"
}
```

### CLI setup tool

`apps/auth-service/src/cli/setup.ts` — `npm run setup`

Interactive first-run wizard:
1. Reads setup token from `~/.sentry/setup.log` (written by auth service on first start).
2. Checks auth service reachable at `AUTH_SERVICE_URL`.
3. Prompts: platform name, slug, admin name, email, password (with strength validation).
4. Calls `POST /superadmin/create-first-admin`.
5. Prints success message with portal URL.

### GET /user/orgs

```
GET /user/orgs   (requires JWT)
→ OrgMembership[]
```

Returns all tenants the user has a role in. Powers the org switcher in the portal header. Includes `isGuest` flag for cross-org memberships.

### UserInvite system

**Entity:** `packages/database/src/entities/user-invite.entity.ts`
- `token` — 128-char hex string (unique, indexed)
- `email`, `tenantId`, `roleIds` (jsonb), `invitedBy`, `expiresAt`, `acceptedAt`

**Migration:** `packages/database/src/migrations/1800200000000-AddUserInvites.ts`

**Three endpoints:**

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /users/invite` | JWT + `users:write` | Creates invite record, sends SES email with token link |
| `GET /auth/invite/validate/:token` | Public | Validates token (not expired, not used), returns `{ email, tenantName, tenantSlug }` |
| `POST /auth/invite/accept` | Public | Creates user, assigns roleIds, marks invite `acceptedAt` |

**Email template:** `apps/auth-service/templates/invite.html` (Handlebars, mint green header, CTA button)

**Invite URL pattern:** `${FRONTEND_URL}/invite/${token}`

---

## Frontend changes

### Middleware (fail-closed)

`apps/admin-portal/middleware.ts`

- On startup check: `GET /superadmin/platform-info`
- If API unreachable → redirect to `/error?reason=api_unavailable` (NOT fail-open to setup page).
- If initialized: sets `sentry-initialized=1` cookie with 1h TTL.
- If not initialized: redirects to `/setup`.

### authClient tenant — slug, never UUID

`apps/admin-portal/app/layout.tsx`

```typescript
tenant: process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG || "sentry"
```

`apps/admin-portal/.env.local`: `NEXT_PUBLIC_SENTRY_TENANT_SLUG=sentry`

UUID fallback removed entirely — TenantResolverMiddleware resolves slug→UUID at the backend.

### Post-login redirect

`apps/admin-portal/app/u/login/page.tsx`

```typescript
function getPostLoginRoute(): string {
  const claims = authClient.getTokenClaims()
  const slug = claims?.tenantSlug ?? platformSlug
  return `/t/${slug}/dashboard`
}
```

`SentryAuthFlow` receives `onSuccess={() => router.replace(getPostLoginRoute())}`.

### TenantSwitcher component

`apps/admin-portal/components/portal/tenant-switcher.tsx`

- Uses React Query to call `authClient.getUserOrgs()`.
- Renders current org with chevron; dropdown lists all orgs.
- Click org → `router.push('/t/{slug}/dashboard')`.
- Wired in `Topbar` → visible on all portal pages.

### Auth pages rewritten (no mocks)

| Page | Route | Fix |
|------|-------|-----|
| Signup | `/u/signup` | `useRegister()` mutation; shows "check your inbox" on success |
| Verify email | `/u/verify-email` | Auto-verifies `?token=` from URL via `useVerifyEmail()`; no OTP UI |
| Magic link | `/u/magic-link` | Reads `tenantSlug` from JWT after `verifyMagicLink(token)`; redirects to correct tenant |
| OAuth callback | `/auth/callback` | Replaced fake 2s delay + hardcoded `acme-corp` with real `claimSocialSession(ct)` |

### Zero `any` audit

All `catch (err: any)` → `catch (err: unknown)` with `err instanceof Error ? err.message : String(err)` narrowing. All `map((event: any) => ...)` → typed via imported interfaces. `tsc --noEmit` passes clean on both apps.

---

## Root .env pattern

All env vars live in the monorepo root `.env`. Loaded by:
- `packages/database/src/data-source.ts` — `dotenv.config({ path: '../../../.env' })`
- `apps/auth-service` — `ConfigModule` `envFilePath: ["../../.env", ".env"]`
- `apps/admin-portal` — reads `.env.local` for `NEXT_PUBLIC_*` vars (Next.js constraint: cannot read parent-dir `.env`)

---

## New queries in admin portal

`apps/admin-portal/lib/queries.ts` additions:

| Hook | Endpoint |
|------|---------|
| `useRegister()` | `POST /auth/register` |
| `useVerifyEmail()` | `POST /auth/verify-email` |
| `useValidateInvite(token)` | `GET /auth/invite/validate/:token` |
| `useAcceptInvite()` | `POST /auth/invite/accept` |

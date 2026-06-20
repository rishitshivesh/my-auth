# Scrolloop Sentry — Sprint Status

> Last updated: 2026-06-21

---

## Sprint 3 — Bootstrap & Multi-Org Foundation

### What was completed

| Task | Status | Notes |
|------|--------|-------|
| Seeder cleanup — sentry-only, env-driven | ✅ Done | `tenants.seed.ts` reads `SENTRY_PLATFORM_NAME`/`SENTRY_PLATFORM_SLUG`; no fake tenants |
| Demo seed split | ✅ Done | `demo.seed.ts` contains acme/startup/default; run via `npm run db:seed:demo` |
| `GET /superadmin/platform-info` | ✅ Done | Returns `{ slug, name, initialized }` — public endpoint, no auth required |
| JWT `tenantSlug` claim | ✅ Done | All issued tokens include `tenantSlug` for slug-based routing on the client |
| `authClient.tenant` — slug not UUID | ✅ Done | `layout.tsx` reads `NEXT_PUBLIC_SENTRY_TENANT_SLUG`; no hardcoded IDs |
| Middleware fail-closed + 1h TTL | ✅ Done | API down → `/error?reason=api_unavailable`; 1h cookie TTL when initialized |
| Post-login redirect `/t/{slug}/dashboard` | ✅ Done | Reads `tenantSlug` from JWT claims; works for sentry-internal and tenant users |
| CLI setup tool (`npm run setup`) | ✅ Done | `src/cli/setup.ts` — interactive prompts, reads setup token from `~/.sentry/setup.log` |
| `GET /user/orgs` endpoint | ✅ Done | Returns org memberships; powers OrgSwitcher |
| OrgSwitcher component | ✅ Done | `tenant-switcher.tsx` rewritten — fetches real orgs from API via React Query |
| `isGuest` + `invitedBy` on UserRole | ✅ Done | Entity updated; migration `1800100000000-AddGuestUserRole.ts` |

### What remains (Sprint 3b)

- Guest membership invite flow (inviting user from org A into org B)
- Cross-tenant `getUserOrgs` (currently returns home-tenant only; guest memberships in foreign schemas need a public-schema membership index table)

---

## Sprint 4 — SDK Architecture & Frontend Rewrite

### Track D — SDK architecture (✅ Done)

| Item | Status | Location |
|------|--------|---------|
| `@scrolloop/sentry-config` package | ✅ Done | `packages/sentry-config/` |
| `SentryAxiosTransport` (axios, unwraps `{ data: T }`, retry on 5xx) | ✅ Done | `packages/sentry-config/src/transport.ts` |
| `resolveSentryConfig()` (throws on missing env vars with clear message) | ✅ Done | `packages/sentry-config/src/index.ts` |
| `@scrolloop/admin-client` package | ✅ Done | `packages/admin-client/` |
| `SentryAdminClient` (users, roles, policies, groups, clients, audit, stats, tenant namespaces) | ✅ Done | `packages/admin-client/src/client.ts` |
| `AdminProvider` + `useAdminClient()` React context | ✅ Done | `packages/admin-client/src/react/provider.tsx` |
| React Query hooks (useUsers, useRoles, usePolicies, useDashboardStats, useAuditLog, …) | ✅ Done | `packages/admin-client/src/react/hooks.ts` |
| `ReactQueryProvider` (stable QueryClient wrapper) | ✅ Done | `apps/admin-portal/components/providers/ReactQueryProvider.tsx` |
| `layout.tsx` — remove hardcoded UUID, remove inline fetch transport | ✅ Done | `apps/admin-portal/app/layout.tsx` |

### Track B — DB isolation (✅ Done — implemented in prior sprints)

| Item | Status | Location |
|------|--------|---------|
| `TenantContextService` (AsyncLocalStorage) | ✅ Done | `src/core/database/tenant-context.service.ts` |
| `TenantSchemaMiddleware` (SET search_path, auto-heal schema) | ✅ Done | `src/common/middlewares/tenant-schema.middleware.ts` |
| `TenantAwareRepository` (abstract base, uses schema-scoped EntityManager) | ✅ Done | `src/core/database/tenant-aware.repository.ts` |
| `UserRepository` (extends TenantAwareRepository) | ✅ Done | `src/modules/user/user.repository.ts` |
| Both middleware layers wired in correct order in GlobalModule | ✅ Done | `src/core/modules/global/index.ts` |

**Remaining Track B gaps:**

- `SessionRepository` extending TenantAwareRepository (currently `@InjectRepository(Session)`)
- `RefreshTokenRepository` extending TenantAwareRepository  
- Schema isolation verification script (`scripts/verify-schema-isolation.ts`)
- Per-tenant migration script (`scripts/migrate-to-schema-per-tenant.ts --dry-run`)

### Track C — Frontend rewrite (🔴 Not started)

**Blocked by:** Track D (now complete). All hooks are available; pages need wiring.

| Screen | Route | Status | Hooks to use |
|--------|-------|--------|-------------|
| Dashboard | `/t/[slug]/dashboard` | ⚠️ Mock data | `useDashboardStats`, `useLoginActivity`, `useUsers` |
| Users list | `/t/[slug]/users` | ⚠️ Partial | `useUsers`, `useInviteUser`, `useDeleteUser`, `useLockUser` |
| User detail | `/t/[slug]/users/[id]` | ❌ Missing | `useUser`, `useUserSessions`, `useAuditLog` |
| RBAC | `/t/[slug]/roles` | ❌ Missing | `useRoles`, `usePermissions`, `usePolicies`, `useGroups` |
| API Clients | `/t/[slug]/clients` | ❌ Missing | `useOAuthClients` |
| Settings | `/t/[slug]/settings` | ⚠️ Partial | `useTenant`, `useUpdateTenant`, `usePasswordPolicy` |
| Audit Log | `/t/[slug]/audit` | ❌ Missing | `useAuditLog` |
| MFA Enroll | `/mfa/enroll` | ❌ Missing | SDK: `authClient.startPasskeyRegistration()` |
| Invite Accept | `/invite/[token]` | ❌ Missing | — |
| Error page | `/error` | ❌ Missing | Static page (`?reason=api_unavailable`) |

**Rules for Track C (all must pass before Track C closes):**

```bash
# Zero fetch() in frontend
grep -r "fetch(" apps/admin-portal --include="*.tsx" --include="*.ts" | grep -v "node_modules\|\.d\.ts\|setup\.ts"
# Must return empty

# Zero mock data
grep -r "Math.random\|setTimeout.*fake\|hardcoded" apps/admin-portal/app --include="*.tsx"
# Must return empty

# Zero feature flags
grep -r "featureFlag\|FEATURE_FLAG\|isEnabled" apps/admin-portal --include="*.tsx"
# Must return empty
```

---

## Environment Variables Required

### Auth service (`apps/auth-service/.env`)

```
SENTRY_PLATFORM_NAME=Scrolloop Sentry   # Display name for platform tenant
SENTRY_PLATFORM_SLUG=sentry             # Slug used everywhere (never a UUID)
AUTH_SERVICE_URL=http://localhost:4000  # Used by CLI setup tool
```

### Admin portal (`apps/admin-portal/.env.local`)

```
NEXT_PUBLIC_AUTH_SERVICE_URL=http://localhost:4000
NEXT_PUBLIC_SENTRY_TENANT_SLUG=sentry
```

---

## Running locally

```bash
# Start dependencies
docker-compose up -d

# Start auth service
cd apps/auth-service && yarn dev

# First-run setup (in a new terminal)
cd apps/auth-service && npm run setup

# Start admin portal
cd apps/admin-portal && yarn dev

# Seed demo data (optional)
cd apps/auth-service && npm run db:seed:demo
```

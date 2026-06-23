# Sprint 4 — Close the Gaps
**Session date:** 2026-06-22
**Agent:** Claude Sonnet 4.6
**Branch:** main
**Approach:** 6 parallel agent tracks dispatched concurrently (worktree isolation)

---

## Context

This sprint targeted every P0 backlog item that left the product looking functional but not actually working: buttons with no handlers, roles never seeded, MFA flows disconnected, SDK dropping sessions on concurrent requests, and tenant branding not rendering on SSR. Six tracks ran in parallel, one agent per track.

A critical mid-sprint correction was applied: an early version of the users page used a hand-rolled `SimpleModal` component instead of shadcn. The rule was re-established — **all UI must use shadcn components from `@repo/ui`. No custom modals, overlays, or inputs.** All six track prompts were updated to include this as an ironclad constraint before dispatch.

---

## Track 1 — RBAC: Permissions Catalog and Controller Coverage

**Commits:** `158b039`, `36934d3`, `7bd4936`

### What was done

**Permission catalog (`permissions.catalog.ts`):**
- Created single source of truth for all permission strings as `Permissions.*` constants
- Added extended groups: `WEBHOOKS_*`, `LDAP_*`, `SCIM_*`, `SAML_*` that were missing from the initial set

**System roles (`system-roles.ts`):**
- Defined Owner (Allow `*`), Admin (Allow most + Deny `tenant:delete`/`tenant:billing`/`users:impersonate`), Member (read-only with `${sentry:UserId}` resource ARN scoping)

**Seeder (`system-roles.seeder.ts`):**
- Idempotent seeder using `SET search_path TO "fk_{slug}"`, upserts roles, creates Policy entities and RolePolicy links

**Tenant registration seeding:**
- Verified `tenant-registration.service.ts` already seeds system roles (Owner/Admin/Member) on new workspace creation with `isSystem: true` and correct policy documents

**Controller coverage:**
- Audited all controllers; found 6 using raw permission strings instead of `Permissions.*` constants: `webhook.controller.ts`, `ldap.controller.ts`, `scim.controller.ts`, `saml.controller.ts`, `user.controller.ts`, `oauth.controller.ts`
- Fixed all to import and use `Permissions.*`
- `dashboard.controller.ts`: two endpoints were completely unguarded (`PATCH /tenant-settings`, `PATCH /tenant-settings/social/:provider`) — added `@UseGuards(PermissionsGuard)` and `@RequirePermissions(Permissions.TENANT_WRITE)`

**Policy engine fix:**
- `policy-evaluation.service.ts`: resource variable substitution was missing — `${sentry:UserId}` and `${sentry:TenantId}` were not being substituted before ARN matching. Fixed.

**Gitignore cleanup:**
- Added `graphify-out/` and `apps/auth-service/build_output.txt` to `.gitignore`
- Removed both from git tracking (`git rm --cached`)

---

## Track 2 — SDK: Refresh Lock, Session Stability, Backend Endpoint

**Commits:** `158b039` (SDK transport), worktree merged cleanly

### What was done

**Serialized refresh lock (`packages/sentry-config/src/transport.ts`):**
- Added `private refreshPromise: Promise<void> | null = null`
- 401 interceptor: if a refresh is already in flight, subsequent 401s wait on the same promise instead of starting a second refresh
- Prevents token family revocation from concurrent refresh races
- `withCredentials: true` set at axios instance level (was missing)
- `onSessionExpired?: () => void` callback property added
- `protected async executeRefresh(): Promise<void>` isolated method
- `scheduleProactiveRefresh(expiresAt: number)` — sets timer 60s before expiry
- `clearRefreshTimer()` and `tryRestoreSession<T>()` methods added
- `download(path, params)` — returns Blob for CSV exports

**RefreshTokenRepository migration (`oauth-refresh-token.service.ts`):**
- Removed `@InjectRepository(OAuthRefreshToken)` raw injection
- Removed `getSchemaName()` — schema routing handled by `TenantAwareRepository` via `AsyncLocalStorage`
- All raw SQL replaced with typed `RefreshTokenRepository` methods: `createToken`, `markUsed`, `revokeByHash`, `revokeFamily`, `revokeAllForUser`, `revokeAllForSession`, `findActiveForUser`
- `cleanupExpiredTokens` retains raw SQL via `this.refreshTokenRepo.manager.query()`, typed as `[unknown[], number]`
- `SessionManagementService` updated to use `RefreshTokenRepository` for `findActiveForSession`

**Module updates:**
- Added `RefreshTokenRepository` as provider to: `auth.module.ts`, `admin.module.ts`, `social-auth.module.ts`, `session.module.ts`, `tenant.module.ts`

**`GET /api/user/workspaces` endpoint:**
- `WorkspaceMembership` interface in `user.service.ts`
- `getUserWorkspaces(userId)` queries `public.user_tenant_memberships` directly
- `@Get('workspaces')` in `user.controller.ts` with `JwtAuthGuard`

**Tenant registration membership insert:**
- `tenant-registration.service.ts` now inserts into `public.user_tenant_memberships` after owner user creation (`ON CONFLICT DO NOTHING`)

**React Query retry config (`ReactQueryProvider.tsx`):**
- `retry` function returns `false` for 401/403 (handles both `SentryAPIError.status` and axios `error.response.status`)
- Never retries mutations

---

## Track 3 — MFA: Enroll Wizard, Enforcement Policy, Settings

**Commits:** worktree merged cleanly into `158b039` base

### What was done

**Shared `CodeInput` component (`components/mfa/enroll/code-input.tsx`):**
- 6 individual `Input` boxes from `@repo/ui`, auto-advance, backspace navigation, paste support
- Configurable length

**4-step MFA enroll wizard (`app/mfa/enroll/page.tsx` + step components):**

Step components in `components/mfa/enroll/`:
- `factor-select-step.tsx` — Three option cards: Authenticator App (active), Passkey (active), Email Code (disabled, "Coming soon" badge from shadcn `Badge`)
- `totp-setup-step.tsx` — QR code image, "Can't scan?" toggle revealing manual key with copy button (`Button variant="outline"`), `CodeInput` for verification, error state
- `backup-codes-step.tsx` — 2-column codes grid in JetBrains Mono, Download/Copy all (`Button`), shadcn `Checkbox`/`Label` confirmation gate, shadcn `Alert` warning. Continue disabled until checked.
- `success-step.tsx` — `ShieldCheck` icon, "MFA is now active", `Button` to dashboard

Page orchestration:
- Step synced to `?step=N` URL param via `useSearchParams`
- TOTP init (`useSetupTotp`) called on entering step 2
- All steps use shadcn components exclusively

**`/u/mfa` redirect:**
- Replaced full custom page (had hardcoded hex, custom inputs) with `redirect('/u/login')`

**MFA enforcement policy (backend):**
- `TenantMfaPolicy` entity (`packages/database/src/entities/tenant-mfa-policy.entity.ts`): `enforceForAllUsers`, `enforceForAdmins`, `gracePeriodDays`, `exemptRoleSlugs`, unique index on `tenantId`
- `MfaPolicyService` (`apps/auth-service/src/modules/mfa/mfa-policy.service.ts`): `getForTenant`, `updateForTenant`, `issueEnrollmentToken` (15min JWT with `purpose: 'mfa_enrollment'`)
- `auth.service.ts` login flow: checks policy + `hasActiveFactor` after password verify; returns `{ status: 'mfa_enrollment_required', enrollmentToken }` when user has no MFA and policy requires it

**MFA policy UI in settings (`app/t/[slug]/settings/page.tsx`):**
- MFA Enforcement section in Security tab using shadcn `RadioGroup`/`RadioGroupItem`/`Label`
- Three options: none / admins only / all users
- Grace period `Select` dropdown
- Wired to `useMfaPolicy` + `useUpdateMfaPolicy` hooks (added to `lib/queries.ts`)
- `TenantMfaPolicy` interface added to `lib/types.ts`

---

## Track 4 — Frontend: User Detail Danger Zone, Audit Filters

**Commits:** worktree merged cleanly

### What was done

**User detail page — danger zone (`app/t/[slug]/users/[id]/page.tsx`):**

All 4 buttons wired with proper shadcn confirmation UI:
- **Suspend Access** (when active): shadcn `Dialog` with `Textarea` for required reason → `useSuspendUser()`. Button disabled until reason entered.
- **Restore Access** (when suspended): shadcn `AlertDialog` confirm → `useRestoreUser()`
- **Force Password Reset**: `AlertDialog` confirm → `useForcePasswordReset()`
- **Reset MFA**: `AlertDialog` confirm → `useResetUserMfa()` (`POST /mfa/reset-user/{userId}`)
- **Delete Identity**: `Dialog` with type-to-confirm `Input` (must match user email exactly). On success: navigate to `/t/${slug}/users`.

All use `AlertDialog` / `Dialog` from `@repo/ui`. No custom overlays.

**Permissions tab added:**
- Calls `POST /admin/policies/simulate` with `action: '*'`, `resource: sentry:tenant:*:*`
- Results grouped by namespace (users, roles, sessions, clients, audit, settings, saml, scim, ldap, webhooks)
- Allow/Deny indicators with `CheckCircle2`/`XCircle`, effect badges, source labels
- Skeleton while loading, error state, empty state

**Audit page — server-side filters (`app/t/[slug]/audit/page.tsx`):**
- Replaced client-side `useTenantActivity(50)` + JS `.filter()` with `useAuditLogsFiltered(filters)` hook
- Event type `Select` dropdown with 14 predefined event types
- Actor search `SentryInput` with 400ms debounce
- Date range inputs (From/To, revealed via toggle)
- Active filter pills shown when any filter is active
- Cursor-based "Load More" button using `data.nextCursor`
- Export Logs button wired to `useExportAuditCsv()` — passes active filters, triggers Blob/anchor download

---

## Track 5 — Tenant: Workspace Switcher, Cross-Tenant Membership, SSR Branding

**Commits:** `62595a7`, `6590448`

### What was done

**`useUserWorkspaces` hook (`lib/queries.ts`):**
- Added `useUserWorkspaces()` with `staleTime: 5min`, wrapping `authClient.getUserOrgs()`
- `UserWorkspace` interface exported

**Workspace switcher:**
- `TenantSwitcher` (`components/portal/tenant-switcher.tsx`) already existed and was fully implemented with shadcn `DropdownMenu`
- Shows active workspace with green indicator, click-outside close, "Create workspace" → `/onboarding` footer
- Wired into `Topbar` which is rendered by `PortalLayout` — no changes needed

**Settings branding tab:**
- Already fully wired: `useBranding`, `useUpdateBranding`, `useUploadLogo` all hooked up
- Logo upload fires `uploadLogo(file)` on file change; color picker and style dropdowns controlled + saved — no changes needed

**Login form tenant logo (`app/u/login/login-form.tsx`):**
- `tenantLogo` prop was accepted but aliased as `_tenantLogo` (unused)
- Fixed: renders `<img>` above auth flow when prop is provided

**SSR branding (`app/u/login/page.tsx`):**
- Server Component — calls `getTenantBranding(slug)` before HTML sent
- Extracts tenant slug from hostname (`{slug}.sentry.scrolloop.com`)
- Passes `tenantLogo` and `primaryColor` to `<LoginForm>` and `<BrandPanel>` as props

**Cross-tenant membership (`packages/database/src/migrations/1920000000000-AddUserTenantMemberships.ts`):**
- Creates `public.user_tenant_memberships` table with unique `(user_id, tenant_id)` constraint
- Indexes on `user_email` and `tenant_id`

**`/onboarding/create-tenant` redirect:**
- File replaced with single `redirect('/onboarding')` Server Component

---

## Track 6 — Backend Services: MFA Policy Endpoints, Stats, Schema Isolation

**Commits:** worktree merged cleanly

### What was done

**MFA policy endpoints in tenant controller:**
- `GET /tenants/mfa-policy` — `@RequirePermissions(Permissions.MFA_READ)` → `mfaPolicyService.getForTenant`
- `PUT /tenants/mfa-policy` — `@RequirePermissions(Permissions.MFA_ENFORCE)` → `mfaPolicyService.updateForTenant`
- `UpdateMfaPolicyDto` with class-validator decorators (`IsBoolean`, `IsInt`, `IsArray`, etc.)
- `MfaPolicyService` injected via `MfaModule` import in `tenant.module.ts`
- `TenantMfaPolicy` entity added to `TypeOrmModule.forFeature` in tenant module
- `packages/database/index.ts` exports `TenantMfaPolicy`

**Stats service:**
- `StatsService` (`apps/auth-service/src/modules/admin/stats.service.ts`):
  - `getDashboardStats(tenantId)`: queries `users` (total, active 30d), `sessions` (`revoked_at IS NULL AND expires_at > NOW()` for active count), MFA adoption via `users.mfa_enabled = true`, API call count via `security_events`
  - `getLoginActivity(tenantId, days)`: groups `security_events` by day matching `auth.login%` event types
- `StatsController` (`apps/auth-service/src/modules/admin/stats.controller.ts`):
  - `GET /admin/stats/dashboard` — `@RequirePermissions(Permissions.TENANT_READ)`
  - `GET /admin/stats/login-activity?days=N` — `@RequirePermissions(Permissions.AUDIT_READ)`
  - Both guarded with `JwtAuthGuard + PermissionsGuard`
- Registered in `AdminModule`

**Schema isolation script:**
- `scripts/verify-schema-isolation.ts` created as alias entry-point delegating to existing `verify-tenant-isolation.ts`

---

## Files Created (new in this sprint)

```
apps/auth-service/src/modules/rbac/constants/permissions.catalog.ts
apps/auth-service/src/modules/rbac/constants/system-roles.ts
apps/auth-service/src/database/seeders/system-roles.seeder.ts
apps/auth-service/src/modules/mfa/mfa-policy.service.ts
apps/auth-service/src/modules/oauth/repositories/refresh-token.repository.ts
apps/auth-service/src/modules/tenant/dto/update-mfa-policy.dto.ts
apps/auth-service/src/modules/admin/stats.service.ts
apps/auth-service/src/modules/admin/stats.controller.ts
apps/admin-portal/components/mfa/enroll/code-input.tsx
apps/admin-portal/components/mfa/enroll/factor-select-step.tsx
apps/admin-portal/components/mfa/enroll/totp-setup-step.tsx
apps/admin-portal/components/mfa/enroll/backup-codes-step.tsx
apps/admin-portal/components/mfa/enroll/success-step.tsx
packages/database/src/entities/tenant-mfa-policy.entity.ts
packages/database/src/migrations/1920000000000-AddUserTenantMemberships.ts
scripts/verify-schema-isolation.ts
docs/logs/sprint-4.md  ← this file
```

## Files Significantly Modified

```
packages/sentry-config/src/transport.ts               — refresh lock, proactive timer, Blob download
packages/admin-client/src/client.ts                   — users.suspend/restore/export/delete, mfa.*, tenant.*, stats.*
apps/auth-service/src/modules/auth/auth.service.ts    — MFA enforcement check post-login
apps/auth-service/src/modules/oauth/services/oauth-refresh-token.service.ts  — RefreshTokenRepository migration
apps/auth-service/src/modules/user/user.service.ts    — getUserWorkspaces method
apps/auth-service/src/modules/user/user.controller.ts — GET /user/workspaces
apps/auth-service/src/modules/tenant/tenant-registration.service.ts  — membership insert + system role seeding
apps/auth-service/src/modules/tenant/tenant.controller.ts  — MFA policy endpoints
apps/auth-service/src/modules/mfa/mfa.module.ts       — MfaPolicyService, exports, JwtModule
apps/auth-service/src/modules/rbac/services/policy-evaluation.service.ts  — resource variable substitution
apps/auth-service/src/modules/rbac/rbac.controller.ts — Permissions.* constants
webhook.controller.ts / ldap.controller.ts / scim.controller.ts / saml.controller.ts / oauth.controller.ts  — Permissions.*
dashboard.controller.ts                               — added missing PermissionsGuard + TENANT_WRITE
apps/admin-portal/app/u/login/page.tsx                — Server Component, SSR branding
apps/admin-portal/app/u/login/login-form.tsx          — Client Component, renders tenantLogo prop
apps/admin-portal/app/u/login/brand-panel.tsx         — Client Component, accepts primaryColor
apps/admin-portal/app/u/mfa/page.tsx                  — replaced with redirect('/u/login')
apps/admin-portal/app/mfa/enroll/page.tsx             — 4-step wizard
apps/admin-portal/app/t/[slug]/users/page.tsx         — shadcn Dialog/AlertDialog for all actions
apps/admin-portal/app/t/[slug]/users/[id]/page.tsx    — danger zone wired, permissions tab added
apps/admin-portal/app/t/[slug]/audit/page.tsx         — server-side filters, cursor pagination, export
apps/admin-portal/app/t/[slug]/settings/page.tsx      — MFA enforcement policy section
apps/admin-portal/app/onboarding/create-tenant/page.tsx  — redirect to /onboarding
apps/admin-portal/lib/queries.ts                      — useMfaPolicy, useUpdateMfaPolicy, useUserWorkspaces, useAuditLogsFiltered, useResetUserMfa
apps/admin-portal/lib/types.ts                        — TenantMfaPolicy interface
apps/admin-portal/providers/ReactQueryProvider.tsx    — retry: never on 401/403
.gitignore                                             — graphify-out/, build_output.txt
```

---

## Corrections Applied Mid-Sprint

**Custom `SimpleModal` → shadcn `Dialog`:**
The initial users page implementation used a hand-rolled `SimpleModal` function component with inline `style` props and raw `<div>` overlay. This violated the project rule requiring all UI to use shadcn components from `@repo/ui`. The page was fully rewritten using `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@repo/ui`, matching the pattern established in `clients/page.tsx`.

The shadcn constraint was added to all six agent track prompts before their second dispatch wave.

---

## Architecture Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Concurrent refresh | Single serialized `refreshPromise` | Prevents token family revocation from concurrent 401s |
| Proactive refresh | 60s before expiry | Eliminates mid-request token expiry entirely |
| MFA enforcement | `mfa_enrollment_required` status from login | Cleanly separates enrollment from challenge without client-side hacks |
| Stats queries | Direct SQL on `security_events` for activity | No separate `audit_logs` table exists; `security_events` is the source |
| `user_tenant_memberships` | `public` schema | Cross-tenant query without `SET search_path` needed; keeps isolation clean |
| MFA policy endpoints | In `tenant.controller.ts` | Logically tenant settings, not a separate module |

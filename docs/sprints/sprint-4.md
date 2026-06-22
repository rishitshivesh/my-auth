# SCROLLOOP SENTRY — SPRINT 4: CLOSE THE GAPS
# Branch: main
# Source of truth: docs/sprint-status.md, Feature Audit sheet, Flows sheet
# 
# READ CLAUDE.md AND GEMINI.md FULLY BEFORE TOUCHING ANY FILE.
# READ EVERY FILE YOU ARE ABOUT TO EDIT BEFORE EDITING IT.
# Create a new branch, if on main currently, and COMMIT AFTER EVERY COMPLETED SUB-TASK. SMALL COMMITS.

---

## SITUATION

This cannot be merged until every
P0 backlog item in the tracker is resolved. The product looks functional
but is not: buttons have no handlers, roles are not seeded, MFA flows are
scattered across unconnected routes, the SDK drops sessions, and tenant
branding does not render on SSR. This sprint closes every one of those gaps.

Six tracks run in parallel. Spawn one agent per track.

---

## IRONCLAD RULES — ALL TRACKS — NO EXCEPTIONS

1. Read every file fully before editing it. No assumptions about content.
2. Zero mock data. Zero hardcoded arrays. Zero fake timeouts.
3. Zero console.log in production code.
4. Zero TypeScript `any` in new or edited code.
5. Zero raw fetch() calls in frontend code — all API calls go through the
   admin-client or auth-client SDK. If the SDK method doesn't exist, add it
   to the SDK package first, then call it from the UI.
6. ALL backend responses are wrapped: { data: T, statusCode: N, message?: string }
   Unwrapping happens in the SDK transport layer. Components receive T only.
7. Every list/table must have three states: Skeleton (loading), EmptyState,
   and inline error with retry. No exceptions.
8. Every destructive action (delete, suspend, revoke) must have a confirmation
   modal before executing. No single-click destructive actions.
9. Backend: every new or changed endpoint must be guarded with
   @RequirePermissions() using the correct permission string.
   No unguarded endpoints except public auth routes.
10. Do NOT touch files outside your track's scope. If you need something
    from another track, add a // NEEDS: comment and continue.
11. Ensure all code is optimized and modular. Prefer mini files for all components, nested in a folder, in snake-case, that makes it look cleaner. Reuse as much code as you can and handle things as generically as you can.

---

## TRACK 1 — RBAC: SEEDING, PERMISSIONS ENGINE, AND AWS-IAM-STYLE POLICIES
## Agents: 1 backend agent

### WHY THIS IS FIRST
The roles page is browse-only because the seeder never ran for the portal.
Every other track depends on correct role/permission enforcement.
This track must complete before tracks 3, 4, and 5 wire their UI actions.

### 1a — AUDIT EXISTING RBAC CODE

Read these files completely before writing anything:

```bash
find apps/auth-service/src/modules/rbac -type f | sort
find apps/auth-service/src/database/seeders -type f | sort
cat apps/auth-service/src/modules/rbac/entities/role.entity.ts
cat apps/auth-service/src/modules/rbac/entities/permission.entity.ts
cat apps/auth-service/src/modules/rbac/entities/policy.entity.ts
cat apps/auth-service/src/modules/rbac/policy-evaluation.service.ts
cat apps/auth-service/src/modules/rbac/rbac.service.ts
cat apps/auth-service/src/modules/rbac/rbac.controller.ts
cat apps/auth-service/src/common/guards/permissions.guard.ts
cat apps/auth-service/src/modules/tenant/tenant-registration.service.ts
```

Understand:
- What roles and permissions currently exist in entities
- What the PolicyDocument / PolicyStatement structure looks like
- Whether the seeder creates roles per-tenant or globally
- Whether tenant-registration.service seeds roles on workspace creation
- Whether PermissionsGuard uses the IAM policy engine or just role checks

### 1b — PERMISSION CATALOG

Create or update:
`apps/auth-service/src/modules/rbac/constants/permissions.catalog.ts`

This file is the single source of truth for all permission strings in the system.
Every @RequirePermissions() decorator, every seeder, every frontend permission
check MUST use constants from this file — never raw strings.

Structure:
```typescript
export const Permissions = {
  // Users
  USERS_READ:               'users:read',
  USERS_WRITE:              'users:write',
  USERS_DELETE:             'users:delete',
  USERS_INVITE:             'users:invite',
  USERS_SUSPEND:            'users:suspend',
  USERS_EXPORT:             'users:export',
  USERS_IMPERSONATE:        'users:impersonate',

  // Roles & RBAC
  ROLES_READ:               'roles:read',
  ROLES_WRITE:              'roles:write',
  ROLES_DELETE:             'roles:delete',
  POLICIES_READ:            'policies:read',
  POLICIES_WRITE:           'policies:write',
  POLICIES_DELETE:          'policies:delete',
  POLICIES_SIMULATE:        'policies:simulate',
  GROUPS_READ:              'groups:read',
  GROUPS_WRITE:             'groups:write',
  GROUPS_DELETE:            'groups:delete',

  // Sessions
  SESSIONS_READ:            'sessions:read',
  SESSIONS_REVOKE:          'sessions:revoke',
  SESSIONS_REVOKE_ALL:      'sessions:revoke_all',

  // OAuth Clients
  CLIENTS_READ:             'clients:read',
  CLIENTS_WRITE:            'clients:write',
  CLIENTS_DELETE:           'clients:delete',
  CLIENTS_ROTATE_SECRET:    'clients:rotate_secret',

  // Audit
  AUDIT_READ:               'audit:read',
  AUDIT_EXPORT:             'audit:export',

  // MFA
  MFA_READ:                 'mfa:read',
  MFA_ENFORCE:              'mfa:enforce',
  MFA_RESET_USER:           'mfa:reset_user',

  // Tenant settings
  TENANT_READ:              'tenant:read',
  TENANT_WRITE:             'tenant:write',
  TENANT_DELETE:            'tenant:delete',
  TENANT_BILLING:           'tenant:billing',

  // API Keys
  API_KEYS_READ:            'api_keys:read',
  API_KEYS_WRITE:           'api_keys:write',
  API_KEYS_DELETE:          'api_keys:delete',
} as const;

export type PermissionString = typeof Permissions[keyof typeof Permissions];
```

### 1c — SYSTEM ROLE DEFINITIONS

Create or update:
`apps/auth-service/src/modules/rbac/constants/system-roles.ts`

These are the three roles bootstrapped for EVERY new tenant. They are
isSystem: true — they cannot be deleted, only assigned/unassigned.

```typescript
export const SystemRoles = {

  OWNER: {
    name: 'Owner',
    slug: 'owner',
    description: 'Full control over the workspace. Cannot be removed by other roles.',
    isSystem: true,
    priority: 100,
    // IAM policy: Allow * on *
    policy: {
      Version: '2024-01-01',
      Statement: [{
        Sid: 'OwnerFullAccess',
        Effect: 'Allow',
        Action: ['*'],
        Resource: ['sentry:tenant:*:*'],
      }],
    },
  },

  ADMIN: {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access except billing and tenant deletion.',
    isSystem: true,
    priority: 80,
    policy: {
      Version: '2024-01-01',
      Statement: [
        {
          Sid: 'AdminAllow',
          Effect: 'Allow',
          Action: [
            'users:*', 'roles:*', 'policies:*', 'groups:*',
            'sessions:*', 'clients:*', 'audit:*', 'mfa:*',
            'tenant:read', 'tenant:write',
            'api_keys:*',
          ],
          Resource: ['sentry:tenant:*:*'],
        },
        {
          Sid: 'AdminDenyDangerous',
          Effect: 'Deny',
          Action: ['tenant:delete', 'tenant:billing', 'users:impersonate'],
          Resource: ['sentry:tenant:*:*'],
        },
      ],
    },
  },

  MEMBER: {
    name: 'Member',
    slug: 'member',
    description: 'Read-only access. Can manage own profile and sessions.',
    isSystem: true,
    priority: 10,
    policy: {
      Version: '2024-01-01',
      Statement: [{
        Sid: 'MemberReadOnly',
        Effect: 'Allow',
        Action: [
          'users:read',
          'roles:read',
          'sessions:read',
          'sessions:revoke', // own sessions only — enforced by resource ARN
          'audit:read',
        ],
        Resource: [
          'sentry:tenant:*:user:${sentry:UserId}', // self only
          'sentry:tenant:*:session:${sentry:UserId}:*', // own sessions
          'sentry:tenant:*:audit:*', // read audit
          'sentry:tenant:*:role:*',  // read roles
        ],
      }],
    },
  },

} as const;
```

### 1d — SEEDER: SYSTEM ROLES PER TENANT

Verify that `tenant-registration.service.ts` seeds all three system roles
when a new tenant is created. If it does not, add it:

After tenant schema creation and before issuing the owner's session:
1. Create Policy entities for each SystemRole's policy document
2. Create Role entities (isSystem: true, linked to the policy)
3. Create Permission entities for the catalog permissions
4. Assign all permissions to the appropriate roles
5. Assign the owner user the 'owner' role

Also create a standalone seeder for development that can run against existing
tenants that were created before this seeder existed:
`apps/auth-service/src/database/seeders/system-roles.seeder.ts`

```bash
# How to run it:
# ts-node -e "require('./src/database/seeders/system-roles.seeder').seed()"
```

The seeder must be idempotent — safe to run multiple times.

### 1e — POLICY EVALUATION ENGINE: VERIFY AND FIX

Read `policy-evaluation.service.ts` completely.

Verify these behaviors. If any is missing or broken, fix it:

1. **Deny always overrides Allow.** If ANY statement matches with
   Effect: 'Deny', the result is denied regardless of Allow statements.
   This is non-negotiable. It is the AWS IAM model.

2. **Wildcard matching.** 'users:*' must match 'users:read', 'users:write',
   'users:delete'. '*' must match everything. Test this with the existing
   unit tests — if they don't exist, write them.

3. **Resource variable substitution.** Before evaluating a policy statement,
   replace `${sentry:UserId}` with the actual userId from the JWT,
   `${sentry:TenantId}` with the tenantId, etc. This is how MEMBER can
   access only their own resources without per-user custom policies.

4. **Condition evaluation.** At minimum implement:
   - `IpAddress.sentry:SourceIp` — CIDR matching (use `ipaddr.js`)
   - `Bool.sentry:MultiFactorAuthPresent` — check JWT's `amr` claim
   - `DateGreaterThan` / `DateLessThan.sentry:CurrentTime`

5. **Permission boundary.** If a Role has a `permissionBoundaryPolicyId`,
   the effective permissions = intersection(role policies, boundary policy).
   A boundary Deny does not add new denies — it just caps the Allow surface.

6. **Caching.** PolicyEvaluationService must cache the collected policies
   for each (userId, tenantId) pair in Redis with a 5-minute TTL.
   `RbacCacheService.invalidateUser(userId, tenantId)` must be called
   whenever roles, group memberships, or policy documents change.

### 1f — PERMISSIONS GUARD: USE THE POLICY ENGINE

Read `permissions.guard.ts`. If it does not currently call
`PolicyEvaluationService.evaluate()`, rewrite it so it does.

The guard must:
1. Extract userId, tenantId from the JWT (already on req.user)
2. Extract required permission from `@RequirePermissions()` decorator
3. Build the resource ARN from the route:
   `sentry:tenant:{tenantId}:{controllerResource}:{resourceId?}`
   Example: `sentry:tenant:abc123:user:xyz456`
4. Build EvaluationContext: { ipAddress, mfaVerified, currentTime }
5. Call `PolicyEvaluationService.evaluate()`
6. On deny: return 403 with { statusCode: 403, error: 'Forbidden',
   message: 'You do not have permission to perform this action',
   deniedBy: result.deniedBy }

### 1g — APPLY @RequirePermissions TO ALL EXISTING ENDPOINTS

Search for every controller method that currently lacks @RequirePermissions:

```bash
grep -rn "@Get\|@Post\|@Put\|@Patch\|@Delete" \
  apps/auth-service/src/modules --include="*.controller.ts" -l
```

For each controller, read it and add the correct permission from the catalog.
Public auth routes (login, register, magic-link, OAuth callbacks, JWKS,
discovery) are excluded. Everything else must be guarded.

### 1h — POLICY SIMULATION ENDPOINT

`POST /api/rbac/policies/simulate`
Body: `{ userId: string, action: string, resource: string, context?: EvaluationContext }`
Response: `{ allowed: boolean, reason: string, trace: TraceEntry[], policiesEvaluated: number }`

This endpoint requires `Permissions.POLICIES_SIMULATE` permission.
It is essential for admins to understand why a user can or cannot do something.

### 1i — TESTS

Write or update unit tests for PolicyEvaluationService:
- Deny overrides Allow when both match
- Wildcard action 'users:*' allows 'users:delete'
- Wildcard action '*' allows everything
- Resource variable ${sentry:UserId} substituted correctly
- IP condition blocks non-matching IP
- MFA condition blocks when mfaVerified=false
- Boundary policy caps permissions correctly
- Cache hit returns without DB query
- Cache invalidated when role changes

---

## TRACK 2 — SDK: FIX SESSION DROPS AND AUTH STABILITY
## Agents: 1 SDK agent

### WHY USERS ARE GETTING LOGGED OUT

Users getting logged out randomly is almost always one of:
1. Token refresh race condition — two concurrent requests both try to refresh,
   one gets a new token, the other uses the revoked old one, family revocation
   kicks in, everything is invalidated
2. The 401 retry interceptor retries and then re-retries on the retry's 401,
   causing an infinite loop that eventually clears the session
3. Refresh cookie not sent on cross-origin requests (missing credentials: 'include')
4. React Query treating a 401 as a permanent error and not retrying at all
5. The proactive refresh timer not running, so tokens expire mid-session

### 2a — AUDIT THE CURRENT SDK

Read these files completely:

```bash
find packages/ -type f -name "*.ts" ! -path "*/dist/*" ! -path "*/node_modules/*" | sort
cat packages/admin-client/src/index.ts   # or wherever the admin client is
cat packages/sdk-typescript/src/client.ts  # or equivalent
```

Understand:
- How the axios interceptor handles 401 responses
- Whether there is a serialized refresh lock (prevents concurrent refreshes)
- Whether credentials: 'include' is set on every request
- Whether there is a proactive refresh timer
- How auth state changes are propagated to React components

### 2b — SERIALIZED REFRESH LOCK

This is the most critical fix. Without it, two concurrent requests that
both get 401s will both try to refresh, causing token family revocation.

```typescript
// In the axios transport (packages/sentry-config/src/transport.ts
// or wherever the axios instance is configured)

private refreshPromise: Promise<void> | null = null;

private setupRefreshInterceptor(): void {
  this.axios.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };

      // Only intercept 401 on non-retry, non-refresh requests
      if (
        error.response?.status !== 401 ||
        originalRequest._retry ||
        originalRequest.url?.includes('/auth/refresh') ||
        originalRequest.url?.includes('/auth/login')
      ) {
        throw new SentryAPIError(
          (error.response?.data as any)?.message ?? error.message,
          error.response?.status ?? 0,
        );
      }

      originalRequest._retry = true;

      // SERIALIZED: if a refresh is already in flight, wait for it
      // Do NOT start a second refresh
      if (!this.refreshPromise) {
        this.refreshPromise = this.executeRefresh().finally(() => {
          this.refreshPromise = null;
        });
      }

      try {
        await this.refreshPromise;
        // Retry the original request with the new token
        return this.axios(originalRequest);
      } catch (refreshError) {
        // Refresh failed — session is truly expired
        // Emit auth state change so UI redirects to login
        this.onSessionExpired?.();
        throw refreshError;
      }
    }
  );
}

private async executeRefresh(): Promise<void> {
  // This hits /api/auth/refresh with credentials: 'include'
  // The refresh token is in the httpOnly cookie — not in the request body
  await this.axios.post('/api/auth/refresh', null, {
    withCredentials: true,
    _retry: true, // prevent interceptor from catching this 401
  } as any);
}
```

### 2c — PROACTIVE TOKEN REFRESH

Do not wait for 401s. Proactively refresh the access token 60 seconds
before it expires. This prevents mid-request expiry entirely.

```typescript
// In SentryWebClient or the React provider

private refreshTimer: ReturnType<typeof setTimeout> | null = null;

private scheduleRefresh(expiresAt: number): void {
  if (this.refreshTimer) clearTimeout(this.refreshTimer);

  const msUntilExpiry = expiresAt * 1000 - Date.now();
  const msUntilRefresh = msUntilExpiry - 60_000; // 60s buffer

  if (msUntilRefresh <= 0) {
    // Already near expiry — refresh immediately
    this.transport.executeRefresh().catch(() => this.onSessionExpired?.());
    return;
  }

  this.refreshTimer = setTimeout(() => {
    this.transport.executeRefresh()
      .then(() => {
        // Reschedule based on new token's expiry
        const session = this.getSession();
        if (session?.expiresAt) this.scheduleRefresh(session.expiresAt);
      })
      .catch(() => this.onSessionExpired?.());
  }, msUntilRefresh);
}
```

Call `scheduleRefresh(session.expiresAt)` every time the session is set
(login, refresh, session restore on page load).

### 2d — SESSION RESTORE ON PAGE LOAD

On app initialization, the SDK must try to restore the session by calling
`GET /api/auth/session` with `credentials: 'include'`. The httpOnly refresh
cookie is sent automatically.

```typescript
async tryRestoreSession(): Promise<Session | null> {
  try {
    const session = await this.transport.get<Session>('/api/auth/session');
    this.setSession(session);
    if (session.expiresAt) this.scheduleRefresh(session.expiresAt);
    return session;
  } catch {
    // No active session — that's fine
    this.setSession(null);
    return null;
  }
}
```

Call `tryRestoreSession()` in the React provider's `useEffect` on mount.
Show a loading state while this is in flight — do NOT render the app
before this completes, or components will flash as unauthenticated.

### 2e — onSessionExpired HANDLER

The SDK must allow the application to register a callback for when the
session definitively expires (refresh also failed):

```typescript
// In SentryWebClient constructor or config
onSessionExpired?: () => void;

// In the React provider:
useEffect(() => {
  client.onSessionExpired = () => {
    // Clear React Query cache
    queryClient.clear();
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(window.location.pathname);
    router.replace(`/u/login?returnTo=${returnUrl}`);
  };
}, [client, queryClient, router]);
```

### 2f — React Query INTEGRATION

React Query must NOT retry on 401. 401 means the session expired and the
refresh also failed — retrying will just loop.

```typescript
// In ReactQueryProvider
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry on auth errors
        if (error instanceof SentryAPIError) {
          if (error.isUnauthorized || error.isForbidden) return false;
        }
        return failureCount < 1; // retry once on other errors
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false, // never retry mutations
    },
  },
});
```

### 2g — credentials: 'include' EVERYWHERE

Verify that EVERY axios request has `withCredentials: true` set at the
instance level, not per-request. The httpOnly cookie must be sent on
every request. Check the axios instance creation in the transport.

### 2h — CORS: VERIFY BACKEND ALLOWS CREDENTIALS

The auth-service must have:
```typescript
app.enableCors({
  origin: (origin, callback) => {
    // ... origin validation
  },
  credentials: true,        // CRITICAL — allows cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug'],
});
```

Read `apps/auth-service/src/core/cors-refresh.service.ts` and verify
credentials: true is set. If not, fix it.

### 2i — ADMIN CLIENT: ADD MISSING METHODS

Read the existing admin-client package and identify any methods called
by the UI (tracks 3, 4, 5) that don't exist yet. Add them.
At minimum, verify these exist:

```typescript
// users
users.invite(data: { email: string; roleIds?: string[] }): Promise<void>
users.suspend(userId: string, reason: string): Promise<void>
users.restore(userId: string): Promise<void>
users.forcePasswordReset(userId: string): Promise<void>
users.delete(userId: string): Promise<void>
users.exportCsv(filters: UserFilters): Promise<Blob>

// roles
roles.list(): Promise<Role[]>
roles.get(id: string): Promise<RoleWithPolicies>
roles.create(data: CreateRoleDto): Promise<Role>
roles.update(id: string, data: UpdateRoleDto): Promise<Role>
roles.delete(id: string): Promise<void>
roles.assignToUser(userId: string, roleId: string): Promise<void>
roles.removeFromUser(userId: string, roleId: string): Promise<void>

// policies
policies.list(): Promise<Policy[]>
policies.get(id: string): Promise<Policy>
policies.create(data: CreatePolicyDto): Promise<Policy>
policies.update(id: string, data: UpdatePolicyDto): Promise<Policy>
policies.delete(id: string): Promise<void>
policies.simulate(req: SimulationRequest): Promise<SimulationResult>
policies.attachToRole(roleId: string, policyId: string): Promise<void>
policies.detachFromRole(roleId: string, policyId: string): Promise<void>

// groups
groups.list(): Promise<Group[]>
groups.create(data: CreateGroupDto): Promise<Group>
groups.delete(id: string): Promise<void>
groups.addMember(groupId: string, userId: string): Promise<void>
groups.removeMember(groupId: string, userId: string): Promise<void>

// sessions
sessions.listForUser(userId: string): Promise<Session[]>
sessions.revoke(sessionId: string): Promise<void>
sessions.revokeAllForUser(userId: string): Promise<void>

// mfa
mfa.getFactorsForUser(userId: string): Promise<MfaFactor[]>
mfa.resetForUser(userId: string): Promise<void>

// audit
audit.list(filters: AuditFilters): Promise<PaginatedResult<AuditEvent>>
audit.exportCsv(filters: AuditFilters): Promise<Blob>

// clients
clients.list(): Promise<OAuthClient[]>
clients.create(data: CreateClientDto): Promise<{ client: OAuthClient; clientSecret: string }>
clients.update(id: string, data: UpdateClientDto): Promise<OAuthClient>
clients.delete(id: string): Promise<void>
clients.rotateSecret(id: string): Promise<{ clientSecret: string }>

// tenant
tenant.get(): Promise<TenantDetail>
tenant.update(data: UpdateTenantDto): Promise<TenantDetail>
tenant.uploadLogo(file: File): Promise<{ url: string }>
tenant.getBranding(): Promise<TenantBranding>
tenant.getMfaPolicy(): Promise<TenantMfaPolicy>
tenant.updateMfaPolicy(data: TenantMfaPolicy): Promise<TenantMfaPolicy>
tenant.getPasswordPolicy(): Promise<PasswordPolicy>
tenant.updatePasswordPolicy(data: PasswordPolicy): Promise<PasswordPolicy>
tenant.delete(confirmation: string): Promise<void>
```

---

## TRACK 3 — MFA: STITCH THE COMPLETE FLOW
## Agents: 1 frontend + backend agent

### WHAT IS BROKEN

MFA logic exists in at least three places with no clear primary path:
- `SentryAuthFlow.tsx` handles MFA challenge inline during login
- `/u/mfa` is a partial route
- `/mfa/enroll` is marked as stub/missing
- Tenant MFA enforcement policy is completely absent (F-023)
- The user gets prompted for MFA at random moments or not at all

### 3a — READ EVERYTHING FIRST

```bash
cat apps/admin-portal/components/auth/SentryAuthFlow.tsx
cat apps/admin-portal/app/u/mfa/page.tsx
cat apps/admin-portal/app/mfa/enroll/page.tsx
cat apps/auth-service/src/modules/mfa/mfa.service.ts
cat apps/auth-service/src/modules/mfa/mfa.controller.ts
cat apps/auth-service/src/modules/auth/auth.service.ts
# Find where mfa_pending temp token is issued:
grep -rn "mfa_pending\|mfa_required\|mfa_temp" apps/auth-service/src --include="*.ts"
```

Understand the complete current MFA flow before changing anything.

### 3b — DEFINE THE CANONICAL MFA FLOW

After reading, establish this as the single canonical flow.
Delete or redirect any route that diverges from it.

**Login with MFA:**
POST /api/auth/login

→ if user has MFA enrolled AND tenant policy requires MFA:

return { status: 'mfa_required', tempToken: '<short-lived JWT>' }

→ SentryAuthFlow receives status: 'mfa_required'

→ stores tempToken in memory (not localStorage)

→ renders MFA challenge UI inline (does NOT redirect to /u/mfa)

→ user enters 6-digit TOTP OR selects backup code

POST /api/auth/mfa/verify  (body: { code, type: 'totp'|'backup', tempToken })

→ verifies code against stored secret

→ invalidates tempToken immediately after use (single-use)

→ issues full JWT + refresh token

→ SentryAuthFlow calls onSuccess callback

→ redirect to /t/{slug}/dashboard

**MFA enrollment (post-login, user-initiated or policy-enforced):**
User navigates to /mfa/enroll OR

→ tenant policy requires MFA AND user has no factor enrolled

→ login succeeds but redirect goes to /mfa/enroll instead of dashboard
/mfa/enroll step 1: Choose factor type (TOTP / Passkey / Email OTP)

/mfa/enroll step 2 (TOTP):

POST /api/mfa/totp/setup → returns { secret, qrCodeDataUrl, backupCodes }

User scans QR code or enters manual key

User enters 6-digit verification code

POST /api/mfa/totp/verify-setup → verifies code → activates factor

Show backup codes (10 codes, download + copy buttons)

User confirms they have saved codes

→ redirect to /t/{slug}/dashboard

/mfa/enroll step 2 (Passkey):

Reuse existing WebAuthn registration flow

→ WebAuthn credential registered as MFA factor

→ redirect to dashboard

**MFA management (in user profile or settings):**
GET /api/mfa/factors → list enrolled factors

DELETE /api/mfa/factors/:id → remove a factor (requires re-auth if only factor)

POST /api/mfa/backup-codes/regenerate → regenerate all 10 backup codes

### 3c — IMPLEMENT /mfa/enroll — COMPLETE 4-STEP WIZARD

`apps/admin-portal/app/mfa/enroll/page.tsx`

This must be a fully wired 4-step wizard using the admin-client SDK.
No mock data. All backend calls real.

Step 1: Factor type selection
- Three option cards: Authenticator App / Passkey / Email Code
- Mark Email Code as "Coming soon" (backend is stub)
- "Continue" button disabled until selection made
- URL state: /mfa/enroll?step=1

Step 2a (TOTP): QR code display
- Calls `sdk.mfa.initTotp()` → gets { qrCodeDataUrl, manualEntryKey, backupCodes }
- Shows QR code image (use <img src={qrCodeDataUrl} />)
- "Can't scan?" toggle → shows JetBrains Mono manual entry key with copy button
- 6 individual character inputs for verification code, auto-advance, paste-support
- "Verify" button calls `sdk.mfa.verifyTotpSetup(code)`
- On success: proceed to step 3
- On error: show "Invalid code, try again" in red, clear inputs

Step 2b (Passkey): WebAuthn registration
- Calls `sdk.auth.startPasskeyRegistration()` → gets challenge options
- Calls `startRegistration()` from @simplewebauthn/browser
- Sends assertion to `sdk.auth.finishPasskeyRegistration()`
- On success: skip to step 4 (no backup codes for passkeys)

Step 3: Backup codes
- Display 10 codes in 2-column grid, JetBrains Mono
- "Download" button → creates a .txt file and triggers download
- "Copy all" button → copies all 10 codes to clipboard
- Warning banner: "These codes cannot be shown again. Save them now."
- Checkbox: "I have saved my backup codes" must be checked
- "Continue" button only enabled when checkbox is checked

Step 4: Success
- Shield + checkmark icon, animated entrance
- "MFA is now active" headline
- Summary: factor type enrolled, backup codes count
- "Go to dashboard" primary button

### 3d — FIX MFA CHALLENGE INLINE IN SentryAuthFlow

Read `SentryAuthFlow.tsx` lines 174-222.

The inline MFA challenge after login must:
1. Show a clean 6-digit input (6 individual boxes, auto-advance)
2. Show "Use a backup code instead" link that switches to a single text input
3. Call `sdk.auth.verifyMfa(code, type)` with the stored tempToken
4. On success: call the onSuccess callback (do NOT handle routing here —
   the parent decides where to go)
5. On error: show error message, clear inputs, do NOT redirect to /u/mfa
6. "Try another method" link if user has multiple factors

Remove any redirect to /u/mfa from within SentryAuthFlow.
The /u/mfa route should redirect to /u/login (it's redundant).

### 3e — TENANT MFA ENFORCEMENT POLICY (BACKEND)

This is F-023 in the audit — completely missing.

Add to tenant settings schema (in the tenant's fk_{slug} schema):

```typescript
// New entity: TenantMfaPolicy
@Entity('tenant_mfa_policy')
export class TenantMfaPolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ default: false }) enforceForAllUsers: boolean;
  @Column({ default: false }) enforceForAdmins: boolean;     // enforce only for admin/owner roles
  @Column({ type: 'int', default: 0 }) gracePeriodDays: number; // days after which MFA becomes required
  @Column({ type: 'simple-array', default: '' }) exemptRoleSlugs: string[]; // roles exempt from enforcement
  @UpdateDateColumn() updatedAt: Date;
}
```

In `auth.service.ts`, after successful password verification and before
issuing the JWT or mfa_required response:

```typescript
// Check if tenant MFA policy requires MFA
const mfaPolicy = await this.mfaPolicyService.getForTenant(tenantId);
const userRoles = await this.rbacService.getUserRoles(userId, tenantId);
const userHasMfa = await this.mfaService.hasActiveFactor(userId, tenantId);

const mfaRequired =
  (mfaPolicy.enforceForAllUsers && !userHasMfa) ||
  (mfaPolicy.enforceForAdmins && userRoles.some(r =>
    ['owner', 'admin'].includes(r.slug)) && !userHasMfa);

if (mfaRequired) {
  // User has no MFA enrolled and policy requires it
  // Issue an 'mfa_enrollment_required' state instead of mfa_required
  return {
    status: 'mfa_enrollment_required',
    // A short-lived token that only permits /mfa/enroll
    enrollmentToken: await this.issueEnrollmentToken(userId, tenantId),
  };
}
```

### 3f — MFA POLICY UI IN TENANT SETTINGS

In `apps/admin-portal/app/t/[slug]/settings/page.tsx`, add a Security tab
section for MFA policy:
MFA Policy

─────────────────────────────────────────────────────

○ No enforcement — users choose whether to enable MFA

○ Enforce for admins and owners only

● Enforce for all users
Grace period: [7] days after which MFA becomes required
[Save MFA Policy]

Calls `adminClient.tenant.updateMfaPolicy(data)`.
Requires `Permissions.MFA_ENFORCE` permission to access this section.

---

## TRACK 4 — FRONTEND: WIRE ALL INERT ACTIONS
## Agents: 1 frontend agent

This track wires the buttons that exist but do nothing.
Read each file before touching it. Every action needs:
- Loading state on the button while the mutation is in flight
- Success: toast notification + React Query cache invalidation
- Error: inline error message (not just toast — keep it visible)
- Confirmation modal for destructive actions (delete, suspend)

### 4a — DASHBOARD: Fix QuickActionCard navigation

File: `apps/admin-portal/app/t/[slug]/dashboard/page.tsx` lines 198-246

The `QuickActionCard` component receives an `href` prop but ignores it.
Fix it: use Next.js `<Link>` or `router.push(href)` inside the card.

Each quick action card must navigate to:
- "Invite User" → open invite modal (not a route)
- "Manage Roles" → `/t/${slug}/roles`
- "View Audit Log" → `/t/${slug}/audit`
- "API Keys" → `/t/${slug}/api-keys`
- "Settings" → `/t/${slug}/settings`
- "OAuth Clients" → `/t/${slug}/clients`

### 4b — USERS PAGE: Wire all actions

File: `apps/admin-portal/app/t/[slug]/users/page.tsx` lines 78-144

Wire these buttons. Each requires the corresponding permission check:

**Invite User** (requires `Permissions.USERS_INVITE`):
- Opens `<InviteUserModal />` component
- Modal: email input, role multi-select (fetches roles from `useRoles()`),
  "Send Invite" button
- Calls `adminClient.users.invite({ email, roleIds })`
- On success: invalidate users query, show toast "Invitation sent to {email}"

**Send Email** (requires `Permissions.USERS_WRITE`):
- Opens `<SendEmailModal />` with subject + body inputs
- Calls `POST /api/admin/users/:id/send-email`
- On success: toast "Email sent"

**Suspend** (requires `Permissions.USERS_SUSPEND`):
- Opens `<ConfirmActionModal title="Suspend user?" />`
- Reason input required
- Calls `adminClient.users.suspend(userId, reason)`
- On success: invalidate user query, update status badge in table

**Delete** (requires `Permissions.USERS_DELETE`):
- Opens `<DeleteConfirmModal />` with type-to-confirm (type the user's email)
- Calls `adminClient.users.delete(userId)`
- On success: remove from list, show toast, navigate back to /users

**Export CSV** (requires `Permissions.USERS_EXPORT`):
- Calls `adminClient.users.exportCsv(currentFilters)`
- Returns a Blob → trigger download with filename `users-{date}.csv`

**Bulk actions bar** (slides up from bottom when rows selected):
- Shows "N users selected"
- "Suspend all" → confirm modal → calls suspend for each (sequential, not parallel)
- "Export selected" → export only selected user IDs

### 4c — USER DETAIL PAGE: Create complete

File: `apps/admin-portal/app/t/[slug]/users/[id]/page.tsx`
This page is marked Missing in the audit. Create it from scratch.

Layout: two columns (280px left, flex-1 right)

Left column:
- User avatar (initials if no photo), name, email
- Status badge, joined date (JetBrains Mono), last active (relative)
- MFA status chip — "TOTP Active" or "No MFA" + "Enroll" link
- Assigned roles list: each role as a chip with × to remove
  "Add role" dropdown to assign new role
- Danger zone card (danger-tinted):
  - Suspend / Restore (toggle based on status)
  - Force password reset
  - Reset MFA (clears all factors, user must re-enroll)
  - Delete user (type-to-confirm)
  Each calls the appropriate `adminClient.users.*` method

Right column — 4 tabs:

Tab: Overview
- Editable fields: Display name, Phone
- Email (read-only with "Request change" note)
- Metadata JSON editor (save button)

Tab: Sessions
- Table: device icon + browser/OS, IP (JetBrains Mono hashed), location,
  started (relative), last activity, "Revoke" button per row
- "Revoke all sessions" button at top right (confirmation required)
- Calls `adminClient.sessions.listForUser(userId)`
- Revoke calls `adminClient.sessions.revoke(sessionId)`

Tab: Audit Log
- `<AuditTimeline />` component filtered to this userId
- Calls `adminClient.audit.list({ userId })`
- "Load more" button (cursor pagination)

Tab: Permissions
- Expandable tree grouped by resource namespace
  Format: "users:read ✓ (via Owner policy)"
         "tenant:delete ✗ (denied by Admin boundary)"
- Calls `adminClient.policies.simulate({ userId, action: '*', resource: 'sentry:tenant:*:*' })`
  to get the full effective permission trace
- Renders the trace grouped by namespace

### 4d — ROLES PAGE: Wire all CRUD

File: `apps/admin-portal/app/t/[slug]/roles/page.tsx` lines 20-154

Left panel (roles list):
- "Create Role" button → `<CreateRoleModal />`
  - Name, description, optional: clone permissions from existing role
  - Calls `adminClient.roles.create(data)`
  - On success: invalidate roles, select new role in panel

- Each role card: name, user count, system badge, "..." menu:
  - Edit (opens modal pre-filled)
  - Duplicate
  - Delete (disabled for isSystem roles with tooltip "System roles cannot be deleted")

Right panel (selected role detail):
- Role name (editable inline for non-system roles)
- Description (editable inline)
- System badge with tooltip explanation

**Permissions matrix section:**
- Grouped by resource namespace (Users, Roles, Sessions, Clients, etc.)
- Each row: permission name, toggle (Allow / Deny / Not set)
- "Not set" is grey, "Allow" is green check, "Deny" is red X
- Changing a toggle immediately calls the appropriate policy update
- System role permissions show as read-only with lock icon

**Policy documents section:**
- List of attached policies: name, type (managed/inline), detach button
- "Attach policy" dropdown: fetches all policies via `adminClient.policies.list()`
- "Create new policy" button → `<PolicyEditorModal />`

**PolicyEditorModal:**
- Policy name input
- JSON editor (use a `<textarea>` with JetBrains Mono, syntax highlighting via CSS)
  Pre-populated with a helpful template:
```json
  {
    "Version": "2024-01-01",
    "Statement": [
      {
        "Sid": "AllowExample",
        "Effect": "Allow",
        "Action": ["users:read"],
        "Resource": ["sentry:tenant:*:user:*"]
      }
    ]
  }
```
- "Validate" button → calls `POST /api/rbac/policies/validate` to check JSON structure
- "Simulate" button → opens simulation panel (userId input + result display)
- "Save" button → calls `adminClient.policies.create(data)` or `adminClient.policies.update(id, data)`
- Inline validation errors from the backend shown below the editor

**Attached users section:**
- Avatar stack of users with this role (max 8 shown, "+N more")
- "Manage members" → expands to search + assign/remove UI

### 4e — CLIENTS PAGE: Wire all actions

File: `apps/admin-portal/app/t/[slug]/clients/page.tsx` lines 14-114

"Add Application" / "Create Client" button → `<CreateClientModal />`:
- Step 1: Choose type
  - Single Page App (SPA) — Authorization Code + PKCE, public client
  - Machine to Machine (M2M) — Client Credentials, confidential client
  - Web Application — Authorization Code, confidential client
  Cards with icon, name, description. Select one to continue.
- Step 2: Configure
  - Name input
  - Allowed callback URLs (tag input)
  - Allowed logout URLs (tag input)
  - Allowed web origins (tag input, for SPA only)
  - Token lifetime (access token: 15min-24h, refresh: 1d-90d)
- Step 3: Created — show client secret ONCE
  - Warning banner with shield icon: "Copy this secret now. It will not be shown again."
  - Secret in TokenDisplay (visible by default, not masked)
  - "Copy secret" button
  - "Done" button

"Configure" button on each existing client card → `<EditClientModal />`:
- Same fields as creation (minus the type — immutable after creation)
- "Save changes" calls `adminClient.clients.update(id, data)`

"Rotate Secret" button → confirmation modal → calls `adminClient.clients.rotateSecret(id)`:
- Shows new secret in the same one-time display pattern

"Delete" button → type-to-confirm → `adminClient.clients.delete(id)`

### 4f — AUDIT PAGE: Wire server-side filters and export

File: `apps/admin-portal/app/t/[slug]/audit/page.tsx` lines 14-139

Current: client-side search only. Fix to:
- Pass search/filter params to `adminClient.audit.list(filters)` as query params
- Filter bar: event type dropdown, actor search, date range picker
- Server-side pagination (cursor-based, "Load more" button)
- "Export Logs" button:
  - Calls `adminClient.audit.exportCsv(currentFilters)`
  - Triggers Blob download with filename `audit-{startDate}-{endDate}.csv`
  - Show loading spinner on button while download is in flight

---

## TRACK 5 — TENANT: SLUG LIFECYCLE, BRANDING ON SSR, WORKSPACE DASHBOARD
## Agents: 1 frontend + backend agent

### 5a — AUDIT WHAT EXISTS

```bash
cat apps/admin-portal/middleware.ts
cat apps/auth-service/src/modules/tenant/tenant-registration.service.ts
cat apps/auth-service/src/modules/tenant/tenant.service.ts
cat apps/auth-service/src/modules/tenant/tenant.controller.ts
# Find branding entity:
grep -rn "TenantBranding\|branding" apps/auth-service/src --include="*.ts" | grep -v spec
```

### 5b — ONBOARDING: CONSOLIDATE DUPLICATE ROUTES

There are two tenant creation routes: `/onboarding` and `/onboarding/create-tenant`.
`/onboarding` is the canonical flow (FLOW-003, Implemented).
`/onboarding/create-tenant` is the legacy route.

Read both pages. If `/onboarding/create-tenant` is truly redundant:
- Add a redirect: `redirect('/onboarding')`
- Do NOT delete it in case it's linked from somewhere

Verify the canonical onboarding flow works end to end:
1. Enter workspace name → slug auto-derived (debounced, real API check)
2. Enter admin email + password
3. POST /api/tenants/register succeeds
4. Redirect to /t/{slug}/dashboard

If any step is broken, fix it. Pay special attention to:
- The slug check must use the real `/api/tenants/slug-check` endpoint
- Registration must get a session cookie back (httpOnly)
- The success redirect must use the slug from the API response, not derive it client-side

### 5c — BRANDING ON SSR

The login page at `rishit.sentry.scrolloop.com/u/login` must show the
tenant's branding (logo, name) even on the first server render — not after
the page loads and a client request fires.

This requires Server-Side Rendering of the tenant branding.

In `apps/admin-portal/app/u/login/page.tsx`:
Convert to a Server Component (remove 'use client' from the page itself,
keep it only on the interactive form child components).

```typescript
// apps/admin-portal/app/u/login/page.tsx
// NO 'use client' at the top — this is a Server Component

import { headers } from 'next/headers';
import { LoginForm } from './LoginForm'; // Client Component

async function getTenantBranding(slug: string) {
  // Server-side fetch — runs before HTML is sent to browser
  const res = await fetch(
    `${process.env.AUTH_SERVICE_URL}/api/tenant/branding?slug=${slug}`,
    { next: { revalidate: 300 } } // cache 5 minutes
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as TenantBranding | null;
}

export default async function LoginPage() {
  const headersList = headers();
  const hostname = headersList.get('host') ?? '';
  const slug = extractTenantSlug(hostname); // same logic as middleware

  const branding = slug ? await getTenantBranding(slug) : null;

  return (
    <main className="min-h-screen grid grid-cols-[60fr_40fr]">
      <div className="flex items-center justify-center p-8">
        <LoginForm
          tenantSlug={slug}
          tenantName={branding?.name}
          tenantLogo={branding?.logoUrl}
        />
      </div>
      <BrandPanel
        tenantName={branding?.name}
        primaryColor={branding?.primaryColor}
      />
    </main>
  );
}
```

The `<LoginForm>` and `<BrandPanel>` are Client Components ('use client')
that receive branding as props from the Server Component above them.

### 5d — TENANT SETTINGS: BRANDING TAB

File: `apps/admin-portal/app/t/[slug]/settings/page.tsx`

Wire the Branding tab:

Logo upload:
- Drag-and-drop zone (react-dropzone or native HTML)
- Accepts: image/png, image/jpeg, image/webp — max 2MB
- Shows preview after selection
- "Upload" button calls `adminClient.tenant.uploadLogo(file)` (multipart/form-data)
- Shows current logo above the dropzone

Primary color:
- Color picker input (`<input type="color">`)
- Preview shows the login page right panel with the selected color
- "Save branding" button calls `adminClient.tenant.update({ primaryColor })`

Workspace name:
- Text input, "Save" button
- Calls `adminClient.tenant.update({ name })`

Slug:
- Read-only display in JetBrains Mono
- Tooltip: "Workspace slugs are permanent. Contact support to change yours."

### 5e — WORKSPACE DASHBOARD: REAL DATA

File: `apps/admin-portal/app/t/[slug]/dashboard/page.tsx`

Replace any remaining mock responses with real hooks:

```typescript
const { data: stats }    = useDashboardStats(); // adminClient.stats.getDashboard()
const { data: activity } = useLoginActivity(14); // adminClient.stats.getLoginActivity(14)
const { data: users }    = useUsers({ limit: 5, sort: 'createdAt:desc' });
const { data: events }   = useAuditLog({ limit: 5 });
```

Verify `GET /api/admin/stats/dashboard` exists in the auth-service.
If it does not:

Create `apps/auth-service/src/modules/admin/stats.controller.ts`:
```typescript
@Get('stats/dashboard')
@RequirePermissions(Permissions.TENANT_READ)
async getDashboardStats(@Req() req: AuthenticatedRequest) {
  return this.statsService.getDashboardStats(req.tenantId);
}
```

`StatsService.getDashboardStats()` should return:
```typescript
{
  totalUsers: number,
  activeUsers30d: number,       // users who logged in in last 30 days
  activeSessions: number,
  apiCalls30d: number,          // from audit_logs count
  mfaAdoptionPercent: number,   // users with MFA / total users * 100
  userGrowthPercent: number,    // (this month - last month) / last month * 100
}
```

### 5f — CROSS-TENANT MEMBERSHIP (FLOW-014 UNBLOCK)

This is blocked on a `public_membership_index` table.

Create the migration:
```sql
-- In packages/database/src/migrations/
CREATE TABLE public.user_tenant_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,         -- the user's canonical ID
  user_email  TEXT NOT NULL,         -- denormalized for lookup without cross-schema queries
  tenant_id   UUID NOT NULL,
  tenant_slug TEXT NOT NULL,
  role_slug   TEXT NOT NULL DEFAULT 'member',
  status      TEXT NOT NULL DEFAULT 'active', -- active, suspended, revoked
  invited_by  UUID,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);
CREATE INDEX ON public.user_tenant_memberships(user_email);
CREATE INDEX ON public.user_tenant_memberships(tenant_id);
```

Update `tenant-registration.service.ts`: when an owner user is created,
insert a row into `public.user_tenant_memberships` for them.

Update the invite acceptance flow: when a user accepts an invite to a
second workspace, insert into `public.user_tenant_memberships`.

Create `GET /api/user/workspaces` endpoint (public schema query):
```typescript
// Returns all tenants the authenticated user belongs to
// Uses public.user_tenant_memberships — no cross-schema queries needed
async getUserWorkspaces(userId: string, userEmail: string) {
  return db.query(
    'SELECT tenant_id, tenant_slug, role_slug, joined_at, status ' +
    'FROM public.user_tenant_memberships ' +
    'WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );
}
```

Update the portal layout to fetch and display workspace switcher:
```typescript
const { data: workspaces } = useQuery({
  queryKey: ['workspaces'],
  queryFn: () => authClient.getUserWorkspaces(),
});
```

---

## TRACK 6 — SESSION + REFRESH TOKEN REPOSITORIES
## Agents: 1 backend agent

### WHY THIS IS CRITICAL

From the tracker (B-004): "Migrate SessionRepository and RefreshTokenRepository."
From the tracker (T-008): "Session and refresh-token repository access respects
tenant context — Status: Missing."

Without this, session and refresh token data stays in the public schema
even after the user creation migration. Token operations can bleed across tenants.

### 6a — READ FIRST

```bash
cat apps/auth-service/src/common/service/session.service.ts
cat apps/auth-service/src/modules/oauth/services/oauth-refresh-token.service.ts
# Find current repository injection:
grep -n "InjectRepository\|Repository<Session>\|Repository<RefreshToken>" \
  apps/auth-service/src/common/service/session.service.ts \
  apps/auth-service/src/modules/oauth/services/oauth-refresh-token.service.ts
cat apps/auth-service/src/core/database/tenant-aware.repository.ts
```

### 6b — SessionRepository

Create `apps/auth-service/src/modules/session/session.repository.ts`:

```typescript
@Injectable()
export class SessionRepository extends TenantAwareRepository<Session> {
  protected get entityTarget() { return Session; }

  constructor(dataSource: DataSource, tenantContext: TenantContextService) {
    super(dataSource, tenantContext);
  }

  async findActiveByUserId(userId: string, tenantId: string): Promise<Session[]> {
    // Defense-in-depth: tenantId filter retained
    return this.find({
      where: { userId, tenantId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findBySessionId(sessionId: string, tenantId: string): Promise<Session | null> {
    return this.findOne({ where: { id: sessionId, tenantId } });
  }

  async revokeSession(sessionId: string, tenantId: string): Promise<void> {
    await this.update({ id: sessionId, tenantId }, { isActive: false } as any);
    // Also invalidate from Redis
    // (call Redis service to del the session key)
  }

  async revokeAllForUser(userId: string, tenantId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .where('userId = :userId AND tenantId = :tenantId', { userId, tenantId })
      .execute();
  }
}
```

Update `SessionService` to inject `SessionRepository` instead of
`@InjectRepository(Session)`. Replace every `this.sessionRepo.*` with
`this.sessionRepository.*`. Keep all `tenantId` WHERE conditions.

### 6c — RefreshTokenRepository

Create `apps/auth-service/src/modules/oauth/repositories/refresh-token.repository.ts`:

Same pattern as SessionRepository. Replace the raw repository injection
in `OAuthRefreshTokenService`.

Key methods:
```typescript
findByToken(hashedToken: string, tenantId: string): Promise<RefreshToken | null>
findFamily(familyId: string, tenantId: string): Promise<RefreshToken[]>
revokeFamily(familyId: string, tenantId: string): Promise<void>
createToken(data: CreateRefreshTokenDto): Promise<RefreshToken>
```

### 6d — RUN ISOLATION VERIFICATION

After implementing 6b and 6c, run:
```bash
ts-node scripts/verify-schema-isolation.ts
```

If the script doesn't exist, create it:
- Create two test tenants
- Create a user + session in each
- Set search_path to fk_tenant_a, query sessions — must only see tenant A's
- Set search_path to fk_tenant_b, query sessions — must only see tenant B's
- Print PASS or FAIL with row counts

The script must print PASS before this track is considered done.

### 6e — CLEAN UP REPOSITORY HYGIENE (B-013)

The tracker notes that build artifacts were committed:
- `graphify-out/GRAPH_REPORT.md`
- `apps/auth-service/build_output.txt`

Check if these are in the repository:
```bash
git ls-files graphify-out/ apps/auth-service/build_output.txt
```

If they are tracked:
1. Add to `.gitignore`: `graphify-out/`, `build_output.txt`
2. Remove from git tracking: `git rm --cached -r graphify-out/ apps/auth-service/build_output.txt`
3. Commit: "chore: remove generated artifacts from tracking"

---

## SYNC POINT — AFTER ALL TRACKS COMPLETE

Before considering this sprint done, verify these cross-track behaviors:

1. **New workspace creation works end to end:**
   - Visit /onboarding → fill form → submit
   - Backend creates tenant, fk_{slug} schema, owner user, 3 system roles
   - Session cookie issued → redirect to /t/{slug}/dashboard
   - Dashboard loads real data (no skeletons stuck, no errors)
   - `rishit.sentry.scrolloop.com/u/login` shows tenant branding without flash

2. **Login stays logged in:**
   - Log in, leave tab open for 20 minutes
   - Make a request — should succeed (proactive refresh ran)
   - Refresh the page — session restored from httpOnly cookie
   - Do NOT get redirected to login unexpectedly

3. **RBAC is enforced:**
   - Log in as a Member role user
   - Try to access /t/{slug}/roles — should get 403 on data fetch
   - Try to invite a user — API returns 403
   - Log in as Admin — all those actions succeed

4. **MFA enrollment to challenge is one connected flow:**
   - Enable MFA enforcement in tenant settings
   - Log in as a user with no MFA enrolled
   - Get redirected to /mfa/enroll instead of dashboard
   - Complete enrollment
   - Get redirected to dashboard
   - Log out and log in again — TOTP challenge appears inline
   - Enter code → access dashboard

5. **Roles page is fully functional:**
   - Create a new role
   - Add permissions via the matrix
   - Create a policy document with Allow + Deny statements
   - Attach policy to role
   - Assign role to a user
   - Use the simulate endpoint to verify permissions

6. **Zero mock data:**
```bash
   grep -rn "mock\|Mock\|MOCK\|hardcode\|Math\.random\|setTimeout.*fake\|featureFlag" \
     apps/admin-portal/app apps/admin-portal/components \
     --include="*.ts" --include="*.tsx" | grep -v "\.spec\." | grep -v node_modules
```
   Must return empty.

7. **Zero direct fetch() calls:**
```bash
   grep -rn "fetch(" apps/admin-portal/app apps/admin-portal/components \
     --include="*.ts" --include="*.tsx" | grep -v node_modules
```
   Must return empty.

8. **Schema isolation passes:**
```bash
   ts-node scripts/verify-schema-isolation.ts
```
   Must print PASS.

---

## FINAL DELIVERABLES CHECKLIST

Track 1 — RBAC:
- [ ] permissions.catalog.ts exists and is the single source of all permission strings
- [ ] system-roles.ts defines Owner/Admin/Member with IAM policy documents
- [ ] Tenant registration seeds all 3 system roles for every new tenant
- [ ] Policy evaluation: Deny overrides Allow — verified by unit test
- [ ] Policy evaluation: wildcard matching works — verified by unit test
- [ ] Policy evaluation: resource variable substitution works
- [ ] Policy evaluation: IP condition works
- [ ] Policy evaluation: MFA condition works
- [ ] PermissionsGuard calls PolicyEvaluationService (not raw role check)
- [ ] Every controller endpoint has @RequirePermissions()
- [ ] POST /api/rbac/policies/simulate returns full trace
- [ ] RbacCacheService invalidated on any role/policy change

Track 2 — SDK:
- [ ] Concurrent refresh serialized — only one refresh in flight at a time
- [ ] Proactive refresh scheduled 60s before token expiry
- [ ] Session restored from httpOnly cookie on app load
- [ ] onSessionExpired callback wired — redirects to /u/login with returnTo
- [ ] React Query: never retries on 401 or 403
- [ ] credentials: 'include' set at axios instance level
- [ ] CORS backend: credentials: true confirmed
- [ ] All admin-client methods listed in 2i are implemented

Track 3 — MFA:
- [ ] /mfa/enroll is a working 4-step wizard (factor select → setup → backup codes → success)
- [ ] TOTP QR code renders from real API response
- [ ] Backup codes shown and downloadable/copyable
- [ ] MFA challenge in SentryAuthFlow uses 6 individual character boxes
- [ ] "Use backup code" toggle works in challenge UI
- [ ] TenantMfaPolicy entity and migration exist
- [ ] Tenant MFA enforcement: user with no MFA redirected to /mfa/enroll
- [ ] MFA policy UI in tenant settings saves and reloads correctly
- [ ] /u/mfa redirects to /u/login (redundant route removed)

Track 4 — Frontend actions:
- [ ] Dashboard QuickActionCard navigation works
- [ ] Users page: Invite works with role selection
- [ ] Users page: Suspend/Restore with reason and confirmation works
- [ ] Users page: Delete with type-to-confirm works
- [ ] Users page: Export CSV downloads a file
- [ ] User detail page: all 4 tabs load real data
- [ ] User detail page: all danger zone actions work
- [ ] Roles page: Create role modal works
- [ ] Roles page: Permissions matrix toggles save
- [ ] Roles page: PolicyEditorModal validates and saves JSON policy
- [ ] Roles page: Policy attach/detach works
- [ ] Clients page: Create client 3-step flow with one-time secret display
- [ ] Clients page: Edit client works
- [ ] Clients page: Rotate secret shows new secret once
- [ ] Clients page: Delete with confirmation works
- [ ] Audit page: server-side filters work
- [ ] Audit page: Export CSV downloads a file

Track 5 — Tenant:
- [ ] /onboarding/create-tenant redirects to /onboarding
- [ ] Onboarding slug check uses real API
- [ ] Onboarding registration → redirect to correct slug dashboard
- [ ] Login page at subdomain shows tenant branding WITHOUT client-side flash (SSR)
- [ ] Tenant settings branding tab: logo upload works
- [ ] Tenant settings branding tab: color picker saves
- [ ] Dashboard shows real stats (not zeros or mocks)
- [ ] public.user_tenant_memberships table exists (migration run)
- [ ] Workspace switcher in portal layout fetches real workspaces
- [ ] Cross-tenant invite flow records membership in public table

Track 6 — Repositories:
- [ ] SessionRepository extends TenantAwareRepository
- [ ] RefreshTokenRepository extends TenantAwareRepository
- [ ] SessionService uses SessionRepository
- [ ] OAuthRefreshTokenService uses RefreshTokenRepository
- [ ] verify-schema-isolation.ts prints PASS
- [ ] Build artifacts removed from git tracking
- [ ] .gitignore updated

Code quality:
- [ ] Zero TypeScript any in new/changed code
- [ ] Zero console.log
- [ ] Zero fetch() in admin-portal components
- [ ] Zero mock data
- [ ] tsc --noEmit passes on both apps
- [ ] All 6 sync point scenarios pass manually
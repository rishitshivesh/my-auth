# SCROLLOOP SENTRY — SPRINT 3c: RELEASE GATE
# Source: Main branch re-review 2026-06-22
# Branch: main
# Goal: Close every P0 before any production onboarding happens
#
# READ CLAUDE.md BEFORE TOUCHING ANY FILE.
# READ EVERY FILE BEFORE EDITING IT.
# COMMIT AFTER EACH COMPLETED ITEM.

---

## CONTEXT

Main branch was reviewed on 2026-06-22. Seven things were verified as fixed.
Six findings remain open. This sprint closes them in priority order.
No new features. No refactoring beyond what is required to fix these gaps.

---

## ITEM 1 — TENANT PROVISIONING: MAKE IT FAIL-CLOSED (M-006, M-007)
## This is the most dangerous bug in the codebase right now.

Read both files completely before touching them:
- apps/auth-service/src/modules/tenant/tenant.service.ts
- apps/auth-service/src/modules/tenant/tenant-registration.service.ts

### The problem in tenant.service.ts (M-006):
The create() method saves the tenant record, then calls TenantSchemaService.createSchema().
If createSchema() throws, the error is caught and logged but NOT re-thrown.
Result: a tenant record exists in public.tenants with no fk_{slug} schema behind it.
Any subsequent user creation, session write, or query will fail in unpredictable ways.

Fix:
```typescript
async create(dto: CreateTenantDto): Promise<Tenant> {
  // Save tenant record
  const tenant = await this.tenantRepo.save(this.tenantRepo.create(dto));

  try {
    // Create the schema — if this fails, the tenant must not exist
    await this.tenantSchemaService.createSchema(tenant.slug);
  } catch (schemaError) {
    // Compensating action: delete the tenant record we just created
    await this.tenantRepo.delete(tenant.id);
    // Also release the slug reservation if one exists
    await this.slugReservationRepo.delete({ slug: tenant.slug }).catch(() => {});
    this.logger.error(`Schema creation failed for ${tenant.slug} — tenant rolled back`, {
      error: schemaError instanceof Error ? schemaError.message : String(schemaError),
      slug: tenant.slug,
    });
    throw new InternalServerErrorException(
      'Workspace provisioning failed. Please try again.'
    );
  }

  return tenant;
}
```

### The problem in tenant-registration.service.ts (M-007):
registerTenant() performs 7+ sequential writes:
tenant → user → roles → policies → assignments → session → tokens
Each is a separate DB call. If step 4 fails, steps 1-3 have already committed.
There is no transaction wrapping them and no compensating cleanup.

Fix — wrap the entire registration in a transaction using TenantContextService:

```typescript
async registerTenant(dto: RegisterTenantDto): Promise<RegistrationResult> {
  // Step 1: Create the tenant record + schema (outside transaction — schema DDL
  // cannot be transactional in PostgreSQL with search_path changes)
  const tenant = await this.tenantService.create({
    slug: dto.slug,
    name: dto.workspaceName,
    status: 'active',
  });
  // If the above throws, nothing was created — safe to propagate

  try {
    // Step 2: All subsequent writes in a single transaction on the tenant schema
    const result = await this.tenantContext.transaction(async (manager) => {
      // Create owner user
      const user = manager.create(User, { ... });
      await manager.save(User, user);

      // Create system roles + policies
      await this.seedSystemRoles(manager, tenant.id);

      // Assign owner role to user
      // ...

      // Create session + tokens
      // ...

      return { user, tenant, session, tokens };
    });

    return result;
  } catch (registrationError) {
    // Compensating cleanup: drop the schema and delete the tenant record
    this.logger.error(`Registration failed for ${tenant.slug} — rolling back`, {
      error: registrationError instanceof Error ? registrationError.message : String(registrationError),
    });
    await this.tenantSchemaService.dropSchema(tenant.slug).catch(() => {});
    await this.tenantRepo.delete(tenant.id).catch(() => {});
    await this.slugReservationRepo.delete({ slug: dto.slug }).catch(() => {});
    throw new InternalServerErrorException(
      'Workspace registration failed. Please try again.'
    );
  }
}
```

### Idempotency:
Add an idempotency key to the registration request (UUID generated client-side,
stored in Redis with TTL 10 minutes). If the same key is submitted twice before TTL
expires, return the first result rather than running registration again.

```typescript
// In the controller, before calling registerTenant:
const idempotencyKey = `tenant-reg:${dto.idempotencyKey}`;
const existing = await this.redis.get(idempotencyKey);
if (existing) return JSON.parse(existing);

const result = await this.tenantRegistrationService.registerTenant(dto);
await this.redis.setex(idempotencyKey, 600, JSON.stringify(result));
return result;
```

Add `idempotencyKey: string` to the registration DTO.
Generate it client-side in the onboarding page (use crypto.randomUUID()).

### Tests to write:
Write these as Jest integration tests (can be run without E2E browser):

T-001: Force schema creation to fail (mock tenantSchemaService.createSchema to throw).
  Assert: no tenant row exists in public.tenants after the request.
  Assert: slug is not reserved after the request.
  Assert: response is 500 with a user-safe error message (not the internal error).

T-002: Simulate step-4 failure in registerTenant (mock role seeding to throw).
  Assert: no user row exists in fk_{slug}.users.
  Assert: no session row exists.
  Assert: fk_{slug} schema was dropped.
  Assert: public.tenants has no row for this slug.

T-003: Submit same registration request twice with same idempotency key.
  Assert: second request returns same result, not a duplicate.
  Assert: only one tenant row exists.

---

## ITEM 2 — OAUTH APPLICATIONS: REPLACE MOCK WITH REAL (M-008, T-007)

Read these files:
- apps/admin-portal/components/portal/applications-table.tsx
- apps/admin-portal/app/t/[slug]/applications/page.tsx (or clients/page.tsx — find the actual route)
- Check what OAuth client API endpoints exist in auth-service

The applications table has:
1. A hardcoded default array of 3 fake applications
2. A "Create Application" button with onClick: () => {}

Fix both completely:

### 2a — Find and verify the OAuth client API
```bash
grep -rn "OAuthClient\|oauth.*client\|/clients" \
  apps/auth-service/src/modules/oauth --include="*.controller.ts"
```

If GET /api/oauth/clients, POST /api/oauth/clients, DELETE /api/oauth/clients/:id,
and POST /api/oauth/clients/:id/rotate exist and work:
proceed to 2b.

If any are missing: create them before building the UI.
The OAuth client entity should already exist from earlier sprints.

### 2b — Wire the applications table

Replace the hardcoded default array with a React Query hook:
```typescript
// In the admin-client package, ensure this exists:
clients: {
  list(): Promise<OAuthClient[]>
  create(data: CreateClientDto): Promise<{ client: OAuthClient; clientSecret: string }>
  update(id: string, data: UpdateClientDto): Promise<OAuthClient>
  delete(id: string): Promise<void>
  rotateSecret(id: string): Promise<{ clientSecret: string }>
}
```

In the applications page/component:
- Remove the hardcoded default array entirely
- Use `useQuery({ queryKey: ['clients', slug], queryFn: () => adminClient.clients.list() })`
- Loading: show skeleton rows
- Empty: show EmptyState with "Create your first application" CTA
- Error: inline error message with retry

### 2c — Create Application flow (3-step modal)

Step 1: Choose type
- SPA (Single Page App) — Authorization Code + PKCE, public
- M2M (Machine to Machine) — Client Credentials, confidential
- Web App — Authorization Code, confidential
- Selection required before continuing

Step 2: Configure
- Name (required)
- Allowed callback URLs (tag input, one per line, required for SPA/Web)
- Allowed logout URLs (tag input, optional)
- Token lifetime (slider: access 15min-24h, refresh 1d-90d, M2M only)

Step 3: Created — show secret ONCE
- Warning banner: "This secret will never be shown again. Copy it now."
- ClientSecret in a visible (unmasked) TokenDisplay with copy button
- "Done" closes modal and refreshes table
- Calls: `adminClient.clients.create(data)` → gets back `{ client, clientSecret }`

### 2d — Per-client actions
Each client card/row:
- "Configure" → edit modal (same fields, no type change)
- "Rotate secret" → confirmation modal → shows new secret once
- "Delete" → type-to-confirm (type the client name) → deletes

### 2e — Test
Write one integration test:
- Create a client via the API
- Verify it appears in the list
- Rotate the secret, verify old secret no longer works for client_credentials
- Delete the client, verify 404 on subsequent requests

---

## ITEM 3 — RBAC ENDPOINT PERMISSIONS (M-010, T-009)

Read:
```bash
cat apps/auth-service/src/modules/rbac/rbac.controller.ts
```

Find every endpoint that currently only has `@UseGuards(JwtAuthGuard)` at
the class level but no `@RequirePermissions()` at the method level, specifically:
- Any endpoint that returns another user's roles or permissions
- Any endpoint that lets you check or simulate permissions for a userId != yourself

For each such endpoint:
- If it is administrative (query any user's permissions): add `@RequirePermissions(Permissions.ROLES_READ)`
- If it should only be self-service (/me style): verify it uses req.user.sub, not a URL param userId

The rule:
- `GET /rbac/users/me/permissions` → self-service, JWT only, no extra guard
- `GET /rbac/users/:userId/permissions` → requires ROLES_READ permission
- `POST /rbac/policies/simulate` → requires POLICIES_SIMULATE permission
- `GET /rbac/roles` → requires ROLES_READ
- `POST /rbac/roles` → requires ROLES_WRITE

Write one test:
- Authenticated request as a Member role user hits GET /rbac/users/{someOtherUserId}/permissions
- Assert: 403 response

---

## ITEM 4 — AUDIT PAGE: SERVER-SIDE FILTERS AND EXPORT (M-009, T-010)

Read:
- apps/admin-portal/app/t/[slug]/audit/page.tsx

Current state: `useTenantActivity(50)` loads 50 events, then filters client-side.
Export Logs and More Filters buttons have no onClick handlers.

Fix:

### 4a — API: verify server-side filter support
The audit endpoint should accept query params: action, actorId, startDate, endDate,
cursor, limit. Check if these exist in auth-service.

If not: add them to the audit controller:
```typescript
@Get()
@RequirePermissions(Permissions.AUDIT_READ)
async listAuditEvents(@Query() filters: AuditFiltersDto, @Req() req) {
  return this.auditService.list(req.tenantId, filters);
}

@Get('export')
@RequirePermissions(Permissions.AUDIT_EXPORT)
async exportAuditEvents(@Query() filters: AuditFiltersDto, @Req() req, @Res() res) {
  const csv = await this.auditService.exportCsv(req.tenantId, filters);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
  res.send(csv);
}
```

### 4b — Frontend: wire filters and export

Replace `useTenantActivity(50)` with a proper query:
```typescript
const [filters, setFilters] = useState<AuditFilters>({
  action: '',
  startDate: null,
  endDate: null,
  cursor: null,
});

const { data, isLoading, fetchNextPage } = useInfiniteQuery({
  queryKey: ['audit', slug, filters],
  queryFn: ({ pageParam }) =>
    adminClient.audit.list({ ...filters, cursor: pageParam }),
  getNextPageParam: (last) => last.nextCursor ?? undefined,
});
```

Filter bar: action type select, date range picker (two date inputs), search input.
Each filter change resets cursor and refetches.

"Export Logs" button:
```typescript
const handleExport = async () => {
  const blob = await adminClient.audit.exportCsv(filters);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-${slug}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

"Load more" button at bottom (not infinite auto-scroll).

---

## ITEM 5 — MFA POLICY: PROVE ENFORCEMENT IN LOGIN (M-011, T-008)

Read:
- apps/auth-service/src/modules/mfa/mfa-policy.service.ts
- apps/auth-service/src/modules/auth/auth.service.ts

The policy service exists and stores policy. The question is whether
auth.service.ts actually calls it during every login path.

### 5a — Find all login entry points
```bash
grep -rn "async login\|async authenticate\|passport.authenticate\|handleCallback" \
  apps/auth-service/src --include="*.ts" | grep -v spec | grep -v ".d.ts"
```

For each login path (password, social, magic link, passkey):
Verify there is a call to mfaPolicyService.checkEnforcement(userId, tenantId)
or equivalent AFTER credentials are verified but BEFORE the final JWT is issued.

If any path is missing this check: add it.

The enforcement logic (already in mfa-policy.service.ts presumably):
```typescript
async checkEnforcement(userId: string, tenantId: string): Promise<EnforcementResult> {
  const policy = await this.getPolicy(tenantId);
  if (!policy.enforceForAllUsers && !policy.enforceForAdmins) {
    return { required: false };
  }

  const hasFactor = await this.mfaService.hasActiveFactor(userId, tenantId);
  if (hasFactor) {
    return { required: false }; // Has MFA — no enforcement needed
  }

  // Needs MFA but doesn't have it enrolled
  const enrollmentToken = await this.issueEnrollmentToken(userId, tenantId);
  return { required: true, reason: 'enrollment_required', enrollmentToken };
}
```

The login response when enforcement applies:
```typescript
// Instead of issuing full JWT:
return {
  status: 'mfa_enrollment_required',
  enrollmentToken,
  message: 'Your workspace requires MFA. Please enroll a factor to continue.',
};
```

Frontend: SentryAuthFlow must handle status: 'mfa_enrollment_required'
by redirecting to /mfa/enroll?token={enrollmentToken}.

### 5b — Write enforcement tests

Test 1: Policy enforceForAllUsers=true, user has no MFA enrolled
  Login via password → response status must be 'mfa_enrollment_required'
  Assert: NO session created, NO JWT issued

Test 2: Policy enforceForAllUsers=true, user HAS MFA enrolled
  Login via password → MFA challenge issued (status: 'mfa_required')
  Complete TOTP → full JWT issued

Test 3: Policy enforceForAdmins=true, user is Owner role, no MFA enrolled
  Login via password → status: 'mfa_enrollment_required'

Test 4: Policy enforceForAdmins=true, user is Member role, no MFA enrolled
  Login via password → normal flow, no enforcement

Test 5: Policy off entirely
  Login via any method → normal flow regardless of MFA status

---

## ITEM 6 — ROOT TEST COMMAND (M-012, T-012)

Read:
- package.json (root)
- apps/auth-service/package.json
- apps/admin-portal/package.json

Add to root package.json scripts:
```json
{
  "scripts": {
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "build": "turbo run build"
  }
}
```

Add to turbo.json pipeline:
```json
{
  "pipeline": {
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

Add to auth-service package.json:
```json
{
  "scripts": {
    "test": "jest --passWithNoTests",
    "test:e2e": "jest --config jest-e2e.config.js --passWithNoTests",
    "test:coverage": "jest --coverage --passWithNoTests",
    "typecheck": "tsc --noEmit"
  }
}
```

Add to admin-portal package.json:
```json
{
  "scripts": {
    "test": "jest --passWithNoTests",
    "typecheck": "tsc --noEmit"
  }
}
```

Verify `yarn test` from repo root runs without error (even with zero tests — `--passWithNoTests`).
Verify `yarn typecheck` from repo root runs tsc on both apps.
Verify `yarn build` from repo root builds both apps.

---

## ORDER OF EXECUTION

1. Item 1 (tenant provisioning) — do this first, it is the most dangerous
   Commit: "fix: make tenant provisioning fail-closed with rollback"

2. Item 6 (root test command) — do this second, needed to verify everything else
   Commit: "chore: add root test/typecheck/build scripts"

3. Item 3 (RBAC endpoint permissions) — quick, surgical
   Commit: "security: guard RBAC check endpoints with RequirePermissions"

4. Item 5 (MFA enforcement) — verify all login paths, write tests
   Commit: "feat: prove MFA policy enforcement across all login paths"

5. Item 2 (OAuth applications) — replace mock, full lifecycle
   Commit: "feat: replace mock applications table with real OAuth client lifecycle"

6. Item 4 (audit server-side) — server filter + export
   Commit: "feat: add server-side audit filters and CSV export"

---

## DONE WHEN

- [ ] `yarn test` from root passes (with Item 1's 3 tests green)
- [ ] `yarn typecheck` from root passes (zero type errors)
- [ ] `yarn build` from root succeeds
- [ ] tenant.service.ts: schema failure causes full rollback, no orphan tenant
- [ ] tenant-registration.service.ts: partial failure causes full cleanup
- [ ] T-001, T-002, T-003 (provisioning tests) pass
- [ ] T-008 (MFA enforcement tests) — all 5 scenarios pass
- [ ] T-009 (RBAC boundary test) passes
- [ ] Applications page loads real data, create/rotate/delete work
- [ ] Audit page uses server-side filters, export downloads a file
- [ ] Zero hardcoded arrays or mock data remain in any page/component
- [ ] Zero console.log in production code
- [ ] Zero TypeScript any in new/changed files
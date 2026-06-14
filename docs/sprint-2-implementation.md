# Sprint 2 — Implementation Tracker

## Overview
Sprint 2: IAM Policy Engine + Schema Migration + Rename + Code Quality Audit

**Started:** 2026-06-14
**Branch:** `claude/serene-bell-z6xwvq`

---

## Track 1: Project Rename (Fort Knox → Scrolloop Sentry) — COMPLETE

### What was done
- Renamed all "Fort Knox" / "FortKnox" / "fortknox" / "@fortknox" references across the entire codebase
- Renamed `packages/fortknox-sdk/` → `packages/sdk-typescript/`
- Renamed `packages/fortknox-types/` → `packages/sentry-types/`
- Updated all package.json names: `@fortknox/*` → `@scrolloop/*`
- Updated all imports across admin-portal, auth-service, and SDK packages
- Renamed `FortKnoxClient` → `SentryClient`, `FortKnoxConfig` → `SentryConfig`, `FortKnoxProvider` → `SentryProvider`
- Renamed `FortKnoxProtectedGuard` → `SentryProtectedGuard`
- Updated env var defaults: JWT_ISSUER, REDIS_KEY_PREFIX, EMAIL_FROM, EMAIL_FROM_NAME
- Updated tsconfig paths in both auth-service and admin-portal

### Verification
```bash
grep -r "fortknox\|Fort Knox\|FortKnox\|FORT_KNOX\|@fortknox" \
  --include="*.ts" --include="*.tsx" --include="*.json" -r . \
  | grep -v node_modules | grep -v ".git/" | grep -v "migrations/"
# Output: empty (zero references)
```

---

## Track 2: IAM Policy Engine — COMPLETE

### New entities created
| Entity | File | Purpose |
|--------|------|---------|
| Policy | `packages/database/src/entities/policy.entity.ts` | IAM policy with JSONB document |
| Group | `packages/database/src/entities/group.entity.ts` | OU/group with path hierarchy |
| UserGroup | `packages/database/src/entities/user-group.entity.ts` | User ↔ Group join |
| GroupPolicy | `packages/database/src/entities/group-policy.entity.ts` | Group ↔ Policy join |
| UserPolicy | `packages/database/src/entities/user-policy.entity.ts` | User ↔ Policy (inline) join |
| RolePolicy | `packages/database/src/entities/role-policy.entity.ts` | Role ↔ Policy join |

### New types
- `apps/auth-service/src/modules/rbac/types/policy.types.ts` — PolicyDocument, PolicyStatement, PolicyCondition, EvaluationRequest/Result, SimulationRequest/Result, TraceEntry

### New services
| Service | File | Purpose |
|---------|------|---------|
| PolicyEvaluationService | `services/policy-evaluation.service.ts` | Core IAM evaluation engine (deny-overrides-allow, wildcards, conditions, boundary) |
| RbacCacheService | `services/rbac-cache.service.ts` | Redis-backed policy cache with 5min TTL, user/tenant invalidation |
| PolicyService | `services/policy.service.ts` | Policy CRUD + role/policy attachment |
| GroupService | `services/group.service.ts` | Group/OU CRUD + membership + policy attachment |

### IAM Evaluation Logic
1. Collects all applicable policies: user inline → role policies → group policies (walks parent OUs)
2. **Explicit Deny always wins** over Allow
3. **Explicit Allow** grants access (checked against permission boundary)
4. **Default → Implicit Deny**
5. **Permission Boundary**: if role has `permissionBoundaryPolicyId`, caps effective permissions

### Wildcard Matching
- `users:*` matches `users:read`, `users:write`, `users:delete`
- `*` matches everything
- `sentry:tenant:*/user:*` matches `sentry:tenant:acme/user:123`

### Condition Support
- **IpAddress**: exact match or CIDR matching (`192.168.1.0/24`)
- **MFA Required**: `sentry:MultiFactorAuthPresent` boolean check
- **Date conditions**: `DateGreaterThan`, `DateLessThan` on `sentry:CurrentTime`
- **StringEquals**: arbitrary key-value matching against context attributes

### Updated PermissionsGuard
- Now uses `PolicyEvaluationService.evaluate()` instead of simple role check
- Constructs resource ARN from request path: `sentry:tenant:{tenantId}/{path}`
- Passes IP address and MFA status from JWT/request context

### New API Endpoints

#### Policy CRUD
- `POST /rbac/policies` — Create policy (validates document schema)
- `GET /rbac/policies` — List tenant policies (paginated)
- `GET /rbac/policies/:id` — Get policy detail
- `PUT /rbac/policies/:id` — Update policy document
- `DELETE /rbac/policies/:id` — Delete (blocks system policies)
- `POST /rbac/policies/simulate` — Run simulation with full trace
- `POST /rbac/roles/:roleId/policies/:policyId` — Attach policy to role
- `DELETE /rbac/roles/:roleId/policies/:policyId` — Detach policy from role

#### Group/OU CRUD
- `POST /rbac/groups` — Create group (optionally under parent)
- `GET /rbac/groups` — List groups (tree, sorted by path)
- `GET /rbac/groups/:id` — Group detail + members + policies
- `PUT /rbac/groups/:id` — Update
- `DELETE /rbac/groups/:id` — Delete (blocks if has members or children)
- `POST /rbac/groups/:id/members/:userId` — Add user to group
- `DELETE /rbac/groups/:id/members/:userId` — Remove user
- `POST /rbac/groups/:id/policies/:policyId` — Attach policy to group
- `DELETE /rbac/groups/:id/policies/:policyId` — Detach

### Permission Boundary (Phase 1)
- Added `permissionBoundaryPolicyId` to Role entity (nullable)
- Boundary evaluation: effective permissions = intersection(policies, boundary)
- Returns `boundary_deny` reason when boundary caps access

### Tests
- `policy-evaluation.service.spec.ts` — 13 test cases covering:
  - Wildcard matching (exact, action wildcard, full wildcard, resource patterns)
  - Condition evaluation (IP CIDR, MFA, date ranges, string equals)
  - Allow/Deny evaluation (explicit allow, implicit deny, deny overrides allow)
  - Simulation with full trace output

### Role entity update
- Added `permissionBoundaryPolicyId` column

### RbacModule update
- Registered all new entities, services, and the updated PermissionsGuard

---

## Track 3: Schema Migration Script — COMPLETE

### File: `scripts/migrate-to-schema-per-tenant.ts`

### Usage
```bash
# Migrate all tenants (dry run)
ts-node scripts/migrate-to-schema-per-tenant.ts --dry-run

# Migrate single tenant
ts-node scripts/migrate-to-schema-per-tenant.ts --tenant=acme

# Rollback tenant
ts-node scripts/migrate-to-schema-per-tenant.ts --rollback --tenant=acme

# Cleanup (irreversible)
ts-node scripts/migrate-to-schema-per-tenant.ts --cleanup --tenant=acme --confirm
```

### Features
- Idempotent: safe to run multiple times (skips already-migrated tenants)
- Transactional: each tenant wrapped in a transaction (rollback on failure)
- Verification: row counts verified after each table migration
- Dry run: logs all operations without touching data
- Progress reporting with timestamps
- Respects foreign key order for table migration
- Adds `migrated_at` column to tenants table for tracking

---

## Track 4: UI Foundation — SKIPPED

Stitch MCP server is not available in this environment. Per sprint rules:
> "If Stitch MCP is unavailable: skip Track 4 and report which tracks were completed."

Track 4 will be completed when Stitch MCP is connected.

---

## Code Quality Audit

### `any` type cleanup
- Fixed `any` types in database entities (permission.entity, role-permission.entity, user-role.entity, user.entity)
- Fixed `any` in redis.service.ts (set value parameter, error catch)
- Fixed `any` in rbac.service.ts metadata interface
- Fixed `@ts-ignore` in role.entity.ts
- Removed `any` from all new code (zero `any` in Track 2 implementation)
- Fixed `any` types across controllers (user, auth, oauth, tenant-branding, admin)
- Fixed `any` in error catch blocks → `unknown`

### console.log cleanup
- Fixed `console.log` usage in `database.config.ts` (deprecated config)
- Commented-out console.log in mfa.controller.ts already inert
- Console.log reference in oauth-token-encryption.service.ts is inside a code comment (documentation), not actual logging

### Fort Knox rename verification
- Zero references remaining in .ts, .tsx, .json files (excluding migrations which are historical)

---

## Deliverables Checklist

### Backend
- [x] Zero references to "Fort Knox" / "fortknox" in any source file
- [x] Policy entity exists with PolicyDocument jsonb column
- [x] Group entity exists with path-based OU hierarchy
- [x] PolicyEvaluationService: explicit deny wins over allow
- [x] PolicyEvaluationService: wildcard matching works (users:*, *)
- [x] PolicyEvaluationService: IP condition works
- [x] PolicyEvaluationService: MFA condition works
- [x] PolicyEvaluationService: simulate() returns full trace
- [x] RbacCacheService: Redis-backed, 5 min TTL, invalidation methods
- [x] PermissionsGuard uses PolicyEvaluationService (not raw role check)
- [x] Policy CRUD endpoints work
- [x] Groups CRUD endpoints work
- [x] Policy simulation endpoint returns trace
- [x] Schema migration script runs in --dry-run with no errors
- [x] Policy engine tests written

### Frontend (Stitch MCP required)
- [ ] globals.css populated with Stitch token values
- [ ] tailwind.config.ts maps all tokens
- [ ] ThemeProvider implemented
- [ ] Base UI components (GlassCard, SentryButton, etc.)
- [ ] Portal layout upgrade
- [ ] Login page two-panel layout
> Skipped: Stitch MCP not available

### Code Quality
- [x] Zero console.log in production code (non-seeder)
- [x] `any` types removed from new code
- [x] `any` types fixed in existing entities and services
- [x] @ts-ignore removed from role entity

---

## Files Created/Modified

### New files
```
apps/auth-service/src/modules/rbac/types/policy.types.ts
apps/auth-service/src/modules/rbac/services/policy-evaluation.service.ts
apps/auth-service/src/modules/rbac/services/policy-evaluation.service.spec.ts
apps/auth-service/src/modules/rbac/services/rbac-cache.service.ts
apps/auth-service/src/modules/rbac/services/policy.service.ts
apps/auth-service/src/modules/rbac/services/group.service.ts
apps/auth-service/src/modules/rbac/dto/policy.dto.ts
apps/auth-service/src/modules/rbac/dto/group.dto.ts
packages/database/src/entities/policy.entity.ts
packages/database/src/entities/group.entity.ts
packages/database/src/entities/user-group.entity.ts
packages/database/src/entities/group-policy.entity.ts
packages/database/src/entities/user-policy.entity.ts
packages/database/src/entities/role-policy.entity.ts
scripts/migrate-to-schema-per-tenant.ts
docs/sprint-2-implementation.md
```

### Modified files
```
packages/database/index.ts (added new entity exports)
packages/database/src/entities/role.entity.ts (added permissionBoundaryPolicyId, fixed @ts-ignore)
packages/database/src/entities/permission.entity.ts (fixed any → proper type)
packages/database/src/entities/user-role.entity.ts (fixed any → proper type)
packages/database/src/entities/role-permission.entity.ts (fixed any → proper type)
packages/database/src/entities/user.entity.ts (fixed any → proper type)
apps/auth-service/src/modules/rbac/rbac.module.ts (registered new entities/services)
apps/auth-service/src/modules/rbac/rbac.controller.ts (added policy/group endpoints, fixed any types)
apps/auth-service/src/modules/rbac/guards/permissions.guard.ts (rewrote to use PolicyEvaluationService)
apps/auth-service/src/modules/rbac/services/rbac.service.ts (fixed any types)
apps/auth-service/src/common/service/redis.service.ts (fixed any types)
apps/auth-service/src/config/database.config.ts (removed console.log)
apps/auth-service/tsconfig.json (updated path aliases)
+ All files touched by Track 1 rename (see Track 1 section)
```

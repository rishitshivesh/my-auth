# Sprint 2 — IAM Policy Engine, Schema Migration & SDK Scaffolding

**Status:** ✅ Complete  
**Goal:** Rewrite RBAC to AWS-IAM-level policy engine; migrate to schema-per-tenant; scaffold all SDKs.

---

## Track 1: Project Rename (Fort Knox → Scrolloop Sentry)

All `fortknox` / `Fort Knox` / `@fortknox/` references replaced with `scrolloop` / `Scrolloop Sentry` / `@scrolloop/` across the entire monorepo. Env var prefix `FORT_KNOX_` → `SENTRY_`. Package names updated. `CLAUDE.md` and `GEMINI.md` updated.

---

## Track 2: IAM Policy Engine

### What was built

The previous RBAC used simple role→permission associations (basic RBAC). This sprint replaced it with a full policy document engine matching AWS IAM semantics.

**Policy document structure:**
```json
{
  "effect": "Allow" | "Deny",
  "actions": ["users:read", "users:write", "rbac:*"],
  "resources": ["urn:sentry:users:*", "urn:sentry:audit:read"],
  "conditions": {
    "ipRange": ["10.0.0.0/8"],
    "mfaRequired": true
  }
}
```

**Evaluation rules:**
1. Explicit `Deny` always wins — regardless of any `Allow`.
2. If no policy matches → implicit deny (default-closed).
3. Wildcard matching: `users:*` matches `users:read`, `users:write`, etc.
4. Conditions evaluated: IP CIDR range, MFA status, time-of-day.

### New entities

| Entity | Purpose |
|--------|---------|
| `Policy` | Stores a policy document (effect, actions[], resources[], conditions) |
| `UserPolicy` | Attaches a policy directly to a user |
| `RolePolicy` | Attaches a policy to a role (all users in that role inherit it) |
| `GroupPolicy` | Attaches a policy to a group |

### PolicyEvaluationService

`apps/auth-service/src/modules/rbac/services/policy-evaluation.service.ts`

- `evaluate(userId, action, resource, context)` → `Allow | Deny`
- Collects all policies applicable to the user (direct + role-inherited + group-inherited).
- Evaluates conditions (CIDR, MFA).
- Returns `Deny` if any matching policy has `effect: Deny`.
- Returns `Allow` if any matching policy has `effect: Allow` and no Deny exists.
- Returns `Deny` (implicit) if no matching policy.

### PermissionsGuard + RequirePermissions decorator

```typescript
@UseGuards(PermissionsGuard)
@RequirePermissions("users:write")
@Post("/users")
createUser() { ... }
```

- `@RequirePermissions(...actions)` attaches metadata to the route.
- `PermissionsGuard` reads the JWT claims, calls `PolicyEvaluationService.evaluate()`.
- If `Deny` → throws `ForbiddenException`.

---

## Track 3: Schema-Per-Tenant Isolation (Sprint 3a — implemented alongside Sprint 2)

### Two-layer isolation architecture

**Layer 1: Schema-level (search_path)**
`TenantSchemaMiddleware` runs on every tenant request after `TenantResolverMiddleware`. It:
1. Acquires a `QueryRunner` from the TypeORM pool.
2. Executes `SET search_path TO "fk_{slug}", public`.
3. Stores the `QueryRunner` in `AsyncLocalStorage` via `TenantContextService`.
4. On response `finish`/`close`: resets `search_path` to `public` and releases the runner.

**Layer 2: Row-level (tenant_id column)**
All entities retain `tenant_id` columns. All service queries retain `WHERE tenant_id = ?`. This means a bug in Layer 1 cannot expose Layer 2 — both must be compromised simultaneously.

### New infrastructure files

| File | Purpose |
|------|---------|
| `src/core/database/tenant-context.service.ts` | AsyncLocalStorage — stores QueryRunner + schemaName per request |
| `src/core/database/tenant-aware.repository.ts` | Abstract base repository — reads from scoped EntityManager |
| `src/common/midllewares/tenant-schema.middleware.ts` | Sets search_path; auto-heals missing schemas |
| `src/modules/user/user.repository.ts` | First TenantAwareRepository implementation (proof of concept) |

### Platform routes excluded from schema middleware

```
GET  /health
GET  /.well-known/*
ALL  /superadmin/*
```
These routes operate on the public schema (platform-level data).

### Request lifecycle

```
1. TenantResolverMiddleware  → resolves slug → req.tenant
2. TenantSchemaMiddleware    → SET search_path → AsyncLocalStorage
3. Guards                   → TenantBindingGuard validates JWT vs req.tenant
4. Controller/Service       → TenantAwareRepository uses scoped EntityManager
5. Response                 → search_path reset, QueryRunner released
```

---

## Track 4: SDK Scaffolding

All SDKs scaffolded in parallel under `packages/`. Each SDK provides:
- JWT verification (RS256, fetches JWKS from `/.well-known/jwks.json`)
- Route protection middleware/guard/interceptor
- Token refresh helper

| Package | Runtime | Status |
|---------|---------|--------|
| `packages/sdk-typescript` | Browser + React + Next.js | ✅ Scaffolded |
| `packages/sdk-node` | Node.js (Express, Fastify, NestJS) | ✅ Scaffolded |
| `packages/sdk-vue` | Vue 3 composables | ✅ Scaffolded |
| `packages/sdk-angular` | Angular module + guards | ✅ Scaffolded |
| `packages/sdk-java` | Spring Boot starter | ✅ Scaffolded |
| `packages/sdk-go` | Go HTTP middleware | ✅ Scaffolded |
| `packages/sdk-python` | Django / FastAPI / Flask | ✅ Scaffolded |
| `packages/sdk-ruby` | Rack middleware | ✅ Scaffolded |
| `packages/sdk-rust` | Axum / Actix middleware | ✅ Scaffolded |
| `packages/sdk-nginx` | OpenResty Lua | ✅ Scaffolded |

---

## Verification

```bash
cd apps/auth-service

# No any types
grep -r ": any" src --include="*.ts"

# No console.log
grep -r "console\." src --include="*.ts" --exclude-path="*/seeder/*"

# Types compile
npx tsc --noEmit
```

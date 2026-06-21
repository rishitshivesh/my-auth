# SCROLLOOP SENTRY — SPRINT 3A
    2 # Deep Dive Fix: Tenant Isolation Architecture (Backend)
    3
    4 ## Background & Motivation
    5 The graphify deep dive revealed a critical gap between the documented architecture and the implemented reality: while row-level tenant isolation (via `tenantId` WHERE clauses) is in place, the PostgreSQL
      `search_path` schema-level isolation (via `TenantSchemaMiddleware`) is entirely missing. This sprint will implement the schema-level isolation using `AsyncLocalStorage` to securely pass a tenant-scoped
      database connection (QueryRunner) to TypeORM repositories.
    6
    7 This is a backend-only sprint to be executed before Sprint 3 (UI).
    8
    9 ## Scope & Impact
10 - Implements `AsyncLocalStorage`-based `TenantContextService` to manage tenant-scoped database connections.
11 - Creates `TenantSchemaMiddleware` to dynamically set the PostgreSQL `search_path`.
12 - Migrates `UserRepository` as a proof of concept.
13 - Retains existing row-level isolation (defense-in-depth).
14 - Updates documentation (`CLAUDE.md`, `GEMINI.md`).
15
16 ## Implementation Steps
17
18 ### 1. TenantContextService
19 - Create `apps/auth-service/src/core/database/tenant-context.service.ts`.
20 - Use `AsyncLocalStorage` to store and retrieve the `QueryRunner`.
21 - Implement `transaction<T>()` helper to support running callbacks inside a database transaction on the tenant-scoped connection.
22
23 ### 2. TenantAwareRepository
24 - Create `apps/auth-service/src/core/database/tenant-aware.repository.ts`.
25 - Abstract base class that fetches the scoped `QueryRunner.manager` from `TenantContextService`. If available, use it; otherwise fallback to the default global `DataSource`.
26
27 ### 3. TenantSchemaMiddleware
28 - Create `apps/auth-service/src/common/midllewares/tenant-schema.middleware.ts`.
29 - Retrieve tenant slug from `req.tenant.slug`.
30 - Auto-heal logic: If schema doesn't exist, create it using `TenantSchemaService.createSchema()`.
31 - Obtain a query runner, run `SET search_path TO "fk_{slug}", public`.
32 - Call `tenantContext.run(queryRunner, next)`.
33 - Cleanup: Reset `search_path TO public` and release query runner on response `finish` and `close` events.
34
35 ### 4. Module Registration
36 - Update `apps/auth-service/src/core/modules/app-module.ts` (or equivalent) to apply `TenantSchemaMiddleware` globally.
37 - Exclude platform routes: `health`, `.well-known/(.*)`, and `superadmin/(.*)`.
38 - Add `TenantContextService` and `TenantSchemaService` to `DatabaseModule`.
39
40 ### 5. Proof of Concept: UserRepository Migration
41 - Create `apps/auth-service/src/modules/user/user.repository.ts` extending `TenantAwareRepository<User>`.
42 - Update `UserService` to inject and use `UserRepository` instead of the raw TypeORM repository.
43 - Ensure `tenantId` WHERE clauses are retained inside `UserRepository` methods.
44
45 ### 6. Defense-in-Depth Comments
46 - Add the following comment above every `tenantId` WHERE clause across backend services:
47   `// Defense-in-depth: tenant_id filter retained alongside schema-level isolation`
48
49 ### 7. Verification Script
50 - Create `scripts/verify-tenant-isolation.ts` to programmatically test the isolation.
51 - The script must create two test tenants and verify that a query scoped to one tenant cannot see the other's users, even without a `WHERE` clause.
52
53 ### 8. Testing
54 - `apps/auth-service/src/common/midllewares/tenant-schema.middleware.spec.ts`: Tests for schema routing, passthrough, auto-heal, cleanup, and 503 errors.
55 - `apps/auth-service/src/core/database/tenant-context.service.spec.ts`: Tests for AsyncLocalStorage, nested contexts, and transaction support.
56
57 ### 9. Documentation Updates
58 - Update `CLAUDE.md` and `GEMINI.md` to reflect the two-layer isolation architecture (Schema-level and Row-level).
59
60 ## Verification & Rollback
61 - The successful execution of `verify-tenant-isolation.ts` acts as the primary verification mechanism.
62 - All unit tests must pass.
63 - Rollback: Revert the application of `TenantSchemaMiddleware` in `AppModule` and fallback to using raw TypeORM repositories in `UserService`.

Read the above and the below, and understand the gaps, fix them. Ensure the repo builds, all types are properly defined and there is no error whatsoeve in running the application. 

```typescript
// In AppModule or AppApiModule configure()
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(TenantResolverMiddleware)
    .forRoutes('*');

  consumer
    .apply(TenantSchemaMiddleware)
    .exclude(
      // Platform routes that don't belong to any tenant:
      { path: 'health', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
      { path: '.well-known/(.*)', method: RequestMethod.GET },
      { path: 'superadmin/(.*)', method: RequestMethod.ALL },
    )
    .forRoutes('*');
}
```

### 5b — Module providers

Add TenantContextService and TenantAwareRepository to the appropriate module:

File: apps/auth-service/src/core/database/database.module.ts
(create if it doesn't exist, otherwise add to an existing core module)

```typescript
@Module({
  imports: [TypeOrmModule],
  providers: [TenantContextService, TenantSchemaService],
  exports: [TenantContextService, TenantSchemaService],
})
export class DatabaseModule {}
```

Import DatabaseModule into AppModule (or AppApiModule).

---

## TASK 6 — MIGRATION: Update ONE service to use TenantAwareRepository

Do NOT refactor all services in this sprint. The row-level isolation currently
working is not broken — this sprint adds schema isolation in parallel.

Pick ONE service to migrate as a proof of concept: UserService.

File: apps/auth-service/src/modules/user/user.repository.ts (CREATE)

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantAwareRepository } from '../../core/database/tenant-aware.repository';
import { TenantContextService } from '../../core/database/tenant-context.service';
import { User } from './entities/user.entity';

@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
  protected get entityTarget() { return User; }

  constructor(dataSource: DataSource, tenantContext: TenantContextService) {
    super(dataSource, tenantContext);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
    // With search_path set to fk_{slug}, this automatically hits
    // fk_{slug}.users instead of public.users
  }

  async findByTenantAndId(tenantId: string, userId: string): Promise<User | null> {
    // NOTE: tenant_id WHERE clause kept for defense-in-depth
    // Even with search_path set correctly, always filter by tenantId
    // This double-defense means a bug in one layer doesn't expose the other
    return this.findOne({ where: { id: userId, tenantId } });
  }
}
```

Update UserService to inject UserRepository instead of the raw TypeORM repository.
Show this as the pattern — document clearly that other services will be migrated
in Sprint 3b.

---

## TASK 7 — DEFENSE-IN-DEPTH: Keep tenantId WHERE clauses

IMPORTANT: Do NOT remove any existing `WHERE tenant_id = ?` clauses from services.

After this middleware is in place, the system has TWO layers of tenant isolation:
1. search_path routing (schema-level) — new
2. tenant_id column filtering (row-level) — existing

Both must stay active. This is defense-in-depth. If one layer fails (e.g.,
wrong search_path set due to a middleware bug), the other catches it.

Add a comment above every tenantId WHERE clause in services:
```typescript
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed
```

---

## TASK 8 — TRANSACTION SUPPORT

The queryRunner on TenantContextService supports transactions.
Document how to use it:

File: apps/auth-service/src/core/database/tenant-context.service.ts
Add these transaction helper methods:

```typescript
/**
 * Run a callback inside a database transaction on the tenant-scoped connection.
 * Automatically commits on success, rolls back on error.
 *
 * Usage:
 *   await this.tenantContext.transaction(async (manager) => {
 *     await manager.save(User, user);
 *     await manager.save(AuditLog, log);
 *   });
 */
async transaction<T>(
  callback: (manager: EntityManager) => Promise<T>
): Promise<T> {
  const qr = this.getQueryRunner();
  if (!qr) {
    throw new Error('No tenant context — cannot run tenant transaction outside request scope');
  }

  await qr.startTransaction();
  try {
    const result = await callback(qr.manager);
    await qr.commitTransaction();
    return result;
  } catch (error) {
    await qr.rollbackTransaction();
    throw error;
  }
}
```

---

## TASK 9 — VERIFICATION SCRIPT

File: scripts/verify-tenant-isolation.ts

A script that proves search_path isolation is working correctly:

```typescript
// Run: ts-node scripts/verify-tenant-isolation.ts

// What it does:
// 1. Creates two test tenants (or uses existing ones)
// 2. Creates a user in each tenant via the UserRepository
// 3. For each tenant:
//    a. Sets search_path to fk_{slug}
//    b. Queries SELECT * FROM users (no WHERE clause)
//    c. Verifies ONLY that tenant's users are returned
//    d. Verifies the other tenant's users are NOT in the results
// 4. Also verify the defense-in-depth:
//    a. Manually set search_path to fk_tenant_a
//    b. Query with WHERE tenant_id = tenant_b_id
//    c. Verify zero results (double isolation working)
// 5. Print a report: PASS or FAIL per test case

// The output of this script should be committed to docs/ as
// isolation-verification-report.txt (with timestamps and counts)
```

---

## TASK 10 — TESTS

File: apps/auth-service/src/common/middlewares/tenant-schema.middleware.spec.ts

Write tests for:

1. **Routes schema path for known tenant**
    - Mock req.tenant = { slug: 'acme', id: '...' }
    - Mock tenantSchemaService.schemaExists() → true
    - Mock dataSource.createQueryRunner() → mock queryRunner
    - Run middleware
    - Assert: queryRunner.query called with `SET search_path TO "fk_acme", public`
    - Assert: next() called
    - Assert: tenantContext.run() called with correct context

2. **Passes through for platform routes (no tenant)**
    - Mock req.tenant = undefined
    - Run middleware
    - Assert: NO queryRunner created
    - Assert: next() called immediately

3. **Auto-heals missing schema**
    - Mock tenantSchemaService.schemaExists() → false
    - Run middleware
    - Assert: tenantSchemaService.createSchema() called with 'acme'
    - Assert: logger.warn called
    - Assert: logger.error called (missing tables warning)
    - Assert: search_path still set and next() called

4. **Releases queryRunner on response finish**
    - Run middleware
    - Emit res 'finish' event
    - Assert: queryRunner.query called with `SET search_path TO public`
    - Assert: queryRunner.release() called

5. **Returns 503 on queryRunner failure**
    - Mock queryRunner.query() → throws Error
    - Run middleware
    - Assert: res.status(503).json() called
    - Assert: queryRunner.release() called
    - Assert: next() NOT called

File: apps/auth-service/src/core/database/tenant-context.service.spec.ts

Write tests for:

1. **Stores and retrieves tenant context via AsyncLocalStorage**
    - Call run() with a mock context and callback
    - Inside callback: call getContext() → verify it returns the mock context
    - Outside callback: call getContext() → verify it returns null

2. **Nested contexts are independent**
    - Run context A, inside it run context B
    - Inside B: getSchemaName() returns B's schema
    - After B: getSchemaName() returns A's schema

3. **hasTenantContext() returns false outside run()**

4. **transaction() commits on success**

5. **transaction() rolls back on error**

---

## TASK 11 — UPDATE DOCUMENTATION

### Update CLAUDE.md and GEMINI.md (in repo root):

In the "Tenant Architecture" section, update:

```markdown
## Tenant Isolation Architecture

TWO layers of isolation are now active simultaneously (defense-in-depth):

### Layer 1: Schema-level (search_path)
TenantSchemaMiddleware runs on every tenant request after TenantResolverMiddleware.
It acquires a connection from the TypeORM pool and executes:
  SET search_path TO "fk_{slug}", public
This routes ALL TypeORM queries for this request to the correct tenant schema.
The connection is returned to the pool after the response completes,
with search_path reset to public.

The queryRunner is stored in AsyncLocalStorage via TenantContextService.
Services use TenantAwareRepository which reads from TenantContextService
instead of the default DataSource pool.

### Layer 2: Row-level (tenant_id column)
All entities retain their tenant_id columns.
All services retain their WHERE tenant_id = ? clauses.
This is defense-in-depth — a bug in Layer 1 does not expose Layer 2.

### Request lifecycle:
1. TenantResolverMiddleware → resolves slug from hostname/header → req.tenant
2. TenantSchemaMiddleware  → sets search_path → stores in AsyncLocalStorage
3. Guards run              → TenantBindingGuard validates JWT vs req.tenant
4. Controller/Service      → TenantAwareRepository uses scoped EntityManager
5. Response sent           → search_path reset, queryRunner released

### Platform routes (excluded from TenantSchemaMiddleware):
- GET /health
- GET /.well-known/*
- ALL /superadmin/*
These routes operate on the public schema (platform-level data).
```

---

## DELIVERABLES CHECKLIST

Infrastructure:
- [ ] TenantContextService exists with AsyncLocalStorage implementation
- [ ] TenantSchemaMiddleware sets search_path using TenantContextService.run()
- [ ] Middleware registered AFTER TenantResolverMiddleware, BEFORE guards
- [ ] Platform routes excluded from middleware (health, JWKS, superadmin)
- [ ] queryRunner released on res.finish AND res.close
- [ ] search_path reset to public before queryRunner is released
- [ ] Auto-heal: missing schemas created on-demand with warn + error log

Isolation:
- [ ] TenantAwareRepository base class implemented
- [ ] UserRepository extends TenantAwareRepository (proof of concept)
- [ ] UserService updated to use UserRepository
- [ ] All existing tenant_id WHERE clauses retained (defense-in-depth)
- [ ] Defense-in-depth comments added to retained WHERE clauses

Transactions:
- [ ] TenantContextService.transaction() helper implemented
- [ ] Works correctly (commit on success, rollback on error)

Tests:
- [ ] TenantSchemaMiddleware: 5 tests (schema route, passthrough, auto-heal, cleanup, 503)
- [ ] TenantContextService: 5 tests (store/retrieve, nested contexts, hasTenant, commit, rollback)
- [ ] All tests pass (or marked skipped with reason if deps unavailable)

Verification:
- [ ] verify-tenant-isolation.ts script implemented
- [ ] Script can be run: ts-node scripts/verify-tenant-isolation.ts --dry-run

Documentation:
- [ ] CLAUDE.md updated with new two-layer isolation architecture
- [ ] GEMINI.md updated to match
- [ ] Code comments explain the AsyncLocalStorage pattern clearly

---

## DO NOT

- Do NOT refactor all services to use TenantAwareRepository in this sprint
  That is Sprint 3b — only UserService this sprint as proof of concept
- Do NOT remove any tenant_id WHERE clauses from any service
- Do NOT change any entity @Entity() decorators to add schema: 'fk_...'
  The search_path approach works BECAUSE entities are schema-agnostic
- Do NOT touch the frontend (apps/admin-portal) — this is backend only
- Do NOT touch the migration script — that runs after this is verified
- Do NOT use Option A (unreliable search_path on pool connection)
  AsyncLocalStorage (Option B) is the only correct approach
- Do NOT start the real migration (moving data into fk_ schemas) until
  verify-tenant-isolation.ts passes cleanly

---

## ORDER OF EXECUTION

1. Read all 7 specified files first — understand before touching
2. Task 2 (TenantContextService) — no dependencies, create first
3. Task 4 (TenantAwareRepository) — depends on TenantContextService
4. Task 1+3 combined (TenantSchemaMiddleware) — depends on both
5. Task 5 (Module registration) — wire everything together
6. Task 6 (UserRepository + UserService migration) — proof of concept
7. Task 7 (Add defense-in-depth comments to other services)
8. Task 8 (Transaction support) — add to TenantContextService
9. Task 9 (Verification script)
10. Task 10 (Tests)
11. Task 11 (Documentation update)

Commit after each task. Small commits. Each one should build and not break
the existing row-level isolation while the schema-level layer is being added.


Context

The graphify deep dive revealed that schema-per-tenant (search_path) isolation is missing. Row-level (tenantId WHERE) isolation works, but schema-level routing via PostgreSQL search_path is not implemented.
Sprint 3a adds the schema layer in parallel as defense-in-depth. Sprint 3 (UI) is planned but not implemented this session — it requires Stitch MCP to be connected.

 ---
SPRINT 3A — Backend Tenant Isolation (IMPLEMENT NOW)

What already exists (don't recreate)

- TenantSchemaService → apps/auth-service/src/core/tenant/tenant-schema.service.ts
  Has getSchemaName(), createSchema(), schemaExists(). Exported from TenantModule.
- TenantResolverMiddleware → apps/auth-service/src/common/midllewares/tenant-resolver.middleware.ts
  Wired globally in GlobalModule.configure().
- DatabaseModule → apps/auth-service/src/core/database/database.module.ts
  Currently just wraps TypeOrmModule.forRootAsync (same config as GlobalModule — duplicate, but leave as-is).
- GlobalModule → apps/auth-service/src/core/modules/global/index.ts
  Imports TenantModule, configures TypeORM, wires TenantResolverMiddleware.

Note on typo: the middlewares folder is midllewares (not middlewares) — match it exactly.

 ---
Task 1 — TenantContextService (NEW FILE)

File: apps/auth-service/src/core/database/tenant-context.service.ts

import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { QueryRunner, EntityManager } from 'typeorm';

interface TenantContext {
queryRunner: QueryRunner;
schemaName: string;
}

@Injectable()
export class TenantContextService {
private readonly storage = new AsyncLocalStorage<TenantContext>();

run<T>(context: TenantContext, callback: () => T): T {
return this.storage.run(context, callback);
}

getContext(): TenantContext | null {
return this.storage.getStore() ?? null;
}

getQueryRunner(): QueryRunner | null {
return this.getContext()?.queryRunner ?? null;
}

getSchemaName(): string | null {
return this.getContext()?.schemaName ?? null;
}

hasTenantContext(): boolean {
return this.getContext() !== null;
}

async transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
const qr = this.getQueryRunner();
if (!qr) throw new Error('No tenant context — cannot run tenant transaction outside request scope');
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
}

 ---
Task 2 — TenantAwareRepository (NEW FILE)

File: apps/auth-service/src/core/database/tenant-aware.repository.ts

Abstract base class. If TenantContextService has a scoped QueryRunner, uses qr.manager (typed to schema). Otherwise falls back to the global DataSource.

import { DataSource, EntityTarget, FindManyOptions, FindOneOptions, ObjectLiteral } from 'typeorm';
import { TenantContextService } from './tenant-context.service';

export abstract class TenantAwareRepository<T extends ObjectLiteral> {
protected abstract get entityTarget(): EntityTarget<T>;

constructor(
protected readonly dataSource: DataSource,
protected readonly tenantContext: TenantContextService,
) {}

protected get manager() {
const qr = this.tenantContext.getQueryRunner();
return qr ? qr.manager : this.dataSource.manager;
}

async findOne(options: FindOneOptions<T>): Promise<T | null> {
return this.manager.findOne(this.entityTarget, options);
}

async find(options?: FindManyOptions<T>): Promise<T[]> {
return this.manager.find(this.entityTarget, options);
}

async save(entity: T): Promise<T> {
return this.manager.save(this.entityTarget, entity);
}

async update(criteria: object, data: Partial<T>): Promise<void> {
await this.manager.update(this.entityTarget, criteria, data);
}

async delete(criteria: object): Promise<void> {
await this.manager.delete(this.entityTarget, criteria);
}
}

 ---
Task 3 — TenantSchemaMiddleware (NEW FILE)

File: apps/auth-service/src/common/midllewares/tenant-schema.middleware.ts

import { Injectable, NestMiddleware, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { TenantSchemaService } from '@/core/tenant/tenant-schema.service';

@Injectable()
export class TenantSchemaMiddleware implements NestMiddleware {
private readonly logger = new Logger(TenantSchemaMiddleware.name);

constructor(
@InjectDataSource() private readonly dataSource: DataSource,
private readonly tenantContext: TenantContextService,
private readonly tenantSchemaService: TenantSchemaService,
) {}

async use(req: Request, res: Response, next: NextFunction): Promise<void> {
// Pass through: no tenant resolved (platform routes, health, etc.)
if (!req.tenant?.slug) {
return next();
}

     const slug = req.tenant.slug;
     const schemaName = this.tenantSchemaService.getSchemaName(slug);
     const qr = this.dataSource.createQueryRunner();

     const cleanup = async () => {
       try {
         await qr.query('SET search_path TO public');
       } catch { /* ignore */ }
       await qr.release();
     };

     res.on('finish', cleanup);
     res.on('close', cleanup);

     try {
       // Auto-heal: if schema doesn't exist, create it
       const exists = await this.tenantSchemaService.schemaExists(slug);
       if (!exists) {
         this.logger.warn({ slug, schemaName }, 'Tenant schema missing — auto-healing');
         await this.tenantSchemaService.createSchema(slug);
         this.logger.error({ slug }, 'Schema created on-demand — tables may be missing, run migrations');
       }

       await qr.query(`SET search_path TO "${schemaName}", public`);

       this.tenantContext.run({ queryRunner: qr, schemaName }, () => next());
     } catch (error) {
       this.logger.error({ slug, error }, 'Failed to set tenant search_path');
       await qr.release();
       res.removeListener('finish', cleanup);
       res.removeListener('close', cleanup);
       res.status(503).json({ statusCode: 503, message: 'Tenant schema unavailable' });
     }
}
}

 ---
Task 4 — Wire middleware + register providers

File: apps/auth-service/src/core/modules/global/index.ts

Add TenantSchemaMiddleware AFTER TenantResolverMiddleware in configure():

import { TenantSchemaMiddleware } from '@/common/midllewares/tenant-schema.middleware';
import { RequestMethod } from '@nestjs/common';

configure(consumer: MiddlewareConsumer) {
consumer.apply(TenantResolverMiddleware).forRoutes('*');

consumer
.apply(TenantSchemaMiddleware)
.exclude(
{ path: 'health', method: RequestMethod.GET },
{ path: '.well-known/jwks.json', method: RequestMethod.GET },
{ path: '.well-known/(.*)', method: RequestMethod.GET },
{ path: 'superadmin/(.*)', method: RequestMethod.ALL },
)
.forRoutes('*');
}

Also import TenantContextService into GlobalModule's imports (it needs to be in scope so middleware DI works). Add to the module's imports or providers:

Since TenantSchemaMiddleware uses TenantSchemaService (from TenantModule, already imported) and TenantContextService (new), add TenantContextService to GlobalModule providers AND exports.

File: apps/auth-service/src/core/database/database.module.ts

Update to export TenantContextService (keep existing TypeORM import):

import { TenantContextService } from './tenant-context.service';

@Module({
imports: [TypeOrmModule.forRootAsync({...})],  // keep as-is
providers: [TenantContextService],
exports: [TenantContextService],
})
export class DatabaseModule {}

 ---
Task 5 — UserRepository (NEW FILE, proof of concept)

File: apps/auth-service/src/modules/user/user.repository.ts

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantAwareRepository } from '@/core/database/tenant-aware.repository';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { User } from '@repo/database';

@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
protected get entityTarget() { return User; }

constructor(
@InjectDataSource() dataSource: DataSource,
tenantContext: TenantContextService,
) {
super(dataSource, tenantContext);
}

async findByEmail(email: string): Promise<User | null> {
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed
return this.findOne({ where: { email } });
}

async findByTenantAndId(tenantId: string, userId: string): Promise<User | null> {
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed
return this.findOne({ where: { id: userId, tenantId } });
}
}

 ---
Task 6 — Update UserService to use UserRepository

File: apps/auth-service/src/modules/user/user.service.ts

- Inject UserRepository alongside (NOT replacing) @InjectRepository(User) — keep existing session + security event repos
- Update findById and findByEmail to delegate to UserRepository
- Add defense-in-depth comments above all remaining tenantId WHERE clauses

File: apps/auth-service/src/modules/user/user.module.ts

- Add UserRepository to providers
- Add TenantContextService to imports (via DatabaseModule or direct provider)

 ---
Task 7 — Defense-in-depth comments

Search all service files for tenantId WHERE conditions. Add this comment above each:
// Defense-in-depth: tenant_id filter retained alongside schema-level isolation
// Both layers must match for a query to succeed

Target files:
- apps/auth-service/src/modules/user/user.service.ts
- apps/auth-service/src/modules/auth/*.service.ts
- apps/auth-service/src/modules/rbac/**/*.service.ts
- Any other service with { where: { tenantId } } or WHERE tenant_id

 ---
Task 8 — Verification script

File: scripts/verify-tenant-isolation.ts

Script to prove isolation works:
1. Connect to DB using DataSource
2. Create/find two test tenants
3. For each: SET search_path TO "fk_{slug}", public then SELECT * FROM users (no WHERE)
4. Verify cross-tenant data not visible
5. Verify double-isolation: set schema A, query with WHERE tenantId = B → 0 results
6. Print PASS/FAIL report

 ---
Task 9 — Tests

File: apps/auth-service/src/common/midllewares/tenant-schema.middleware.spec.ts

5 tests:
1. Routes schema path for known tenant (assert SET search_path TO "fk_acme", public)
2. Passes through for platform routes (no queryRunner created)
3. Auto-heals missing schema (calls createSchema, warns)
4. Releases queryRunner on response finish
5. Returns 503 on queryRunner failure

File: apps/auth-service/src/core/database/tenant-context.service.spec.ts

5 tests:
1. Stores/retrieves context via AsyncLocalStorage
2. Nested contexts are independent
3. hasTenantContext() returns false outside run()
4. transaction() commits on success
5. transaction() rolls back on error

 ---
Task 10 — Documentation

Update CLAUDE.md and GEMINI.md to describe the two-layer isolation architecture (schema-level + row-level).

 ---
Order of execution

1. Create TenantContextService
2. Create TenantAwareRepository
3. Create TenantSchemaMiddleware
4. Update DatabaseModule + GlobalModule (wire everything)
5. Create UserRepository, update UserService + UserModule
6. Add defense-in-depth comments across services
7. Create verification script
8. Write tests
9. Update CLAUDE.md + GEMINI.md

After each task: run npx tsc --noEmit in apps/auth-service/ to catch type errors.

 ---
SPRINT 3 — UI (PLAN ONLY — DO NOT IMPLEMENT)

Sprint 3 is frontend-only. Zero backend changes. All 10 screens.

Pre-requisite (BLOCKING)

Stitch MCP must be connected before ANY file is touched:
gcloud auth application-default login
claude mcp add -e GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID \
-s user stitch -- npx -y @_davideast/stitch-mcp proxy
Verify with /mcp — stitch must show connected.

High-level execution order

Step 0: Connect Stitch, fetch scrolloop-sentry design system tokens.

Step 1 — Foundation
- apps/admin-portal/app/globals.css — all CSS variables from Stitch
- apps/admin-portal/tailwind.config.ts — map all tokens to Tailwind classes
- apps/admin-portal/components/providers/ThemeProvider.tsx — light/dark toggle
- apps/admin-portal/app/layout.tsx — QueryClientProvider + ThemeProvider, remove hardcoded tenant UUID

Step 2 — Component library (all in apps/admin-portal/components/ui/)

┌───────────────┬───────────────────────────────────────────────────────────┐
│   Component   │                    Key variants/props                     │
├───────────────┼───────────────────────────────────────────────────────────┤
│ GlassCard     │ tier 1/2/3, padding sm/md/lg/none                         │
├───────────────┼───────────────────────────────────────────────────────────┤
│ SentryButton  │ primary/accent/ghost/destructive/icon, loading state      │
├───────────────┼───────────────────────────────────────────────────────────┤
│ SentryInput   │ label, error, helper, rightElement                        │
├───────────────┼───────────────────────────────────────────────────────────┤
│ StatusBadge   │ active/pending/suspended/deleted/admin/mfa-enabled/system │
├───────────────┼───────────────────────────────────────────────────────────┤
│ NavItem       │ icon, label, href, active, badge                          │
├───────────────┼───────────────────────────────────────────────────────────┤
│ TokenDisplay  │ masked default, reveal toggle, copy with checkmark        │
├───────────────┼───────────────────────────────────────────────────────────┤
│ Skeleton      │ text/card/table-row/avatar/button, shimmer                │
├───────────────┼───────────────────────────────────────────────────────────┤
│ EmptyState    │ icon, title, description, action                          │
├───────────────┼───────────────────────────────────────────────────────────┤
│ PageHeader    │ title, subtitle, action slot, breadcrumb                  │
├───────────────┼───────────────────────────────────────────────────────────┤
│ DataTable     │ columns, data, loading, selectable, pagination            │
├───────────────┼───────────────────────────────────────────────────────────┤
│ ThemeToggle   │ calls useTheme().toggle()                                 │
├───────────────┼───────────────────────────────────────────────────────────┤
│ AuditTimeline │ events, loading, dot colors                               │
└───────────────┴───────────────────────────────────────────────────────────┘

Step 3 — Portal layout (apps/admin-portal/components/layouts/portal-layout.tsx)
- Sidebar 240px (GlassCard tier 1), NavItem for each nav item, driven by usePathname()
- Topbar 56px, ThemeToggle + avatar dropdown
- Mobile collapse behavior

Step 4 — Screens (each needs loading + empty + error states, light + dark verified)

┌────────────────────┬──────────────────────────────────┬─────────┐
│       Screen       │               File               │ Status  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Login (+ MFA step) │ app/u/login/page.tsx             │ rewrite │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Dashboard          │ app/t/[slug]/page.tsx            │ rewrite │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Users List         │ app/t/[slug]/users/page.tsx      │ rewrite │
├────────────────────┼──────────────────────────────────┼─────────┤
│ User Detail        │ app/t/[slug]/users/[id]/page.tsx │ CREATE  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ RBAC               │ app/t/[slug]/roles/page.tsx      │ CREATE  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ API Clients        │ app/t/[slug]/clients/page.tsx    │ CREATE  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Settings (4 tabs)  │ app/t/[slug]/settings/page.tsx   │ rewrite │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Audit Log          │ app/t/[slug]/audit/page.tsx      │ CREATE  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ MFA Enrollment     │ app/mfa/enroll/page.tsx          │ CREATE  │
├────────────────────┼──────────────────────────────────┼─────────┤
│ Invite Accept      │ app/invite/[token]/page.tsx      │ CREATE  │
└────────────────────┴──────────────────────────────────┴─────────┘

Step 5 — React Query hooks (apps/admin-portal/hooks/)
useUsers, useStats, useAuditLog, useClients, useRoles, useGroups, useSessions, useMfa — all via SDK client, never raw fetch().

Sprint 3 rules (absolute)

- ZERO raw hex colors — only CSS vars or Tailwind tokens
- ZERO mock data — all real API calls via hooks
- ZERO useEffect for data fetching — React Query only
- ZERO console.log
- Every list: loading / empty / error state
- Both themes verified per component
- tsc --noEmit must pass on apps/admin-portal/

 ---
Verification

Sprint 3a:
cd apps/auth-service
npx tsc --noEmit
grep -r "console\." src --include="*.ts" --exclude-path="*/seeder/*"
grep -r ": any" src --include="*.ts"
ts-node scripts/verify-tenant-isolation.ts --dry-run
grep -r "console\." src --include="*.ts" --exclude-path="*/seeder/*"
grep -r ": any" src --include="*.ts"
ts-node scripts/verify-tenant-isolation.ts --dry-run

     Sprint 3 (after UI):
     cd apps/admin-portal
     npx tsc --noEmit
     grep -r "#[0-9A-Fa-f]\{3,6\}" components --include="*.tsx"
     grep -r "console\." app components --include="*.tsx"


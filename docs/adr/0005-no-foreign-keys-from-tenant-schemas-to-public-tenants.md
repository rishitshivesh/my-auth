# ADR-0005: No foreign keys from tenant schemas to `public.tenants`

- Status: Accepted
- Date: 2026-10-21

## Context
Every table cloned into a tenant schema (`fk_{slug}`) from `template` carried a foreign key to
`public.tenants(id)` (`ON DELETE CASCADE`), and `TenantSchemaService.recreateForeignKeys()`
re-created those constraints for each new schema. `DELETE FROM tenants WHERE id = $1` therefore
has to visit the referencing table in **every** tenant schema, not just the deleted tenant's:
Postgres locks each referencing relation (and its indexes) for the cascade/RI check. With a few
hundred schemas that is thousands of locks in one transaction and the statement fails with
`out of shared memory` (`max_locks_per_transaction`). The same fan-out makes every
`ALTER TABLE ... ADD/DROP CONSTRAINT` on `tenants` slow and lock-heavy, and it grows with every
tenant, so it is a scaling wall rather than a one-off bug.

The test database hit it first: after ~700 accumulated tenant schemas, tenant deletion could not
run at all.

## Options considered
1. **Drop the cross-schema FKs; delete a tenant by dropping its schema explicitly.** Lock cost
   becomes proportional to the tenant being deleted, independent of the number of tenants.
2. Raise `max_locks_per_transaction`. Postponed, not fixed: cost still grows with tenant count,
   needs a server restart and per-environment tuning.
3. Delete in a loop, schema by schema, in separate transactions. Keeps the FKs (and the lock
   fan-out for every other statement touching `tenants`) and leaves partial deletes on failure.
4. Move to database-per-tenant. Far larger change; out of scope (see ADR-0001).

## Decision
**Option 1.** Isolation does not depend on these constraints: it comes from the schema
(`search_path`) and from the `tenant_id` filters AGENTS.md requires on every tenant query. The
`tenant_id` columns stay (defence in depth); only the constraints to `public.tenants` go.

## Implementation
- Migration `DropTenantSchemaForeignKeysToTenants1948000000000` drops every FK from a table in
  `template` or any `fk_*` schema to `public.tenants`. It runs outside the migration executor's
  transaction and commits **per schema**, so a failure part-way leaves finished schemas done and
  the rest is picked up by re-running. Idempotent: it finds only constraints that still exist.
- `TenantSchemaService.recreateForeignKeys()` now only recreates foreign keys whose target is
  inside the template schema (intra-tenant FKs such as `sessions.user_id -> users.id`). Anything
  pointing outside the tenant schema is skipped, so new tenants never get the constraint back.
- New tables must not add an FK to `public.tenants`; keep a plain `tenant_id uuid NOT NULL`
  column. Migrations that add a per-tenant table apply to `template` and every `fk_*` schema.
- `TenantSchemaService.dropSchema(slug)` runs `DROP SCHEMA IF EXISTS "<schema>" CASCADE` with the
  identifier from `getSchemaName()` (restricted to `[a-z0-9_]`, never built from request input)
  and forgets the verified-schema cache entry. `AdminService.deleteTenant()` now invalidates the
  tenant cache, drops the schema, deletes the tenant's signing keys and then deletes the
  `tenants` row. Registration rollback already used the same `DROP SCHEMA` step.
- Verified by an e2e test that creates 60 extra schemas (31 tables each) and deletes one tenant
  through `DELETE /admin/tenants/:id`, plus unit tests for provisioning and `dropSchema`.

## Consequences
- Tenant deletion cost no longer depends on the number of tenants.
- The database no longer prevents a tenant-schema row from carrying a `tenant_id` that has no
  `tenants` row; the schema boundary and the application-level filters are the guard, as they
  already were for reads.
- Orphans are possible only if a schema is dropped without deleting the `tenants` row (or the
  reverse). `deleteTenant` performs both in order; a failure between them leaves a tenant row
  without a schema, which `TenantSchemaMiddleware` heals on the next request.

# ADR-0001: Schema-per-tenant PostgreSQL isolation

- Status: Accepted
- Date: 2026-03 (recorded retroactively 2026-10-11)

## Context
Tenants are enterprises that expect strong data isolation, per-tenant export/erasure and a
credible answer to "can another customer's bug read our data?".

## Decision
Each tenant gets schema `fk_{slug}`, created from the `template` schema. Requests run on a
QueryRunner whose `search_path` points at the tenant schema (AsyncLocalStorage +
DataSource proxy). `tenant_id` columns and filters are kept as a second layer.

## Consequences
- Per-tenant backup/export/drop is a schema operation.
- Migrations must update `template` and every `fk_*` schema.
- Code outside a request (cron, queues, CLI) must set tenant context explicitly.
- The current per-request pinned connection limits concurrency (REMEDIATION_PLAN P1-9).

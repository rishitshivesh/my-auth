# ADR-0002: Global owner modules for stateful services

- Status: Accepted
- Date: 2026-10-11

## Context
Shared services were listed in the `providers` of many feature modules. Nest creates one
instance per listing, which produced 7 Redis connections, 3 `JwksService` instances racing to
generate platform keys, two RBAC caches that disagreed after role changes, and a boot failure
whenever a module used `@Protected()` without importing `DatabaseModule`.

## Decision
Three `@Global` modules own all cross-cutting stateful services:
`DatabaseModule` (DataSource, `TenantContextService`, `SessionRepository`, CORS refresh),
`SharedServicesModule` (Redis, security events, sessions, JWKS, refresh tokens) and
`GuardsModule` (auth guards, RBAC services and cache). Feature modules never re-provide them.

## Consequences
- One instance per process; boot no longer depends on import order.
- New cross-cutting services go into one of these modules, never into feature `providers`.

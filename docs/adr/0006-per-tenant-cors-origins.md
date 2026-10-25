# ADR-0006: Per-tenant CORS origins

- Status: Accepted
- Date: 2026-10-25

## Context
CORS was one global allow-list: `CORS_ORIGINS` plus the union of every tenant's
`tenants.allowed_origins` and every tenant's OAuth-client `allowed_origins`, refreshed every 60 s.
Any tenant's origin was therefore accepted on requests for every other tenant, so a page on tenant
A's registered origin could make credentialed browser calls against tenant B's API. Tenant admins
also had no endpoint to manage their own list.

## Options considered
1. **Per-request check against the request's own tenant, platform list as fallback.** Reuses the
   existing `tenants.allowed_origins` column; no schema change.
2. Keep the union but add a `tenant_id` check later in a guard. Too late: CORS headers are decided
   before routing, and the response would already expose data to the wrong origin.
3. Only subdomain-per-tenant origins. Rules out customer apps on their own domains.

## Decision
**Option 1.** `CorsRefreshService` now keeps an in-memory map `tenant slug -> origins` (tenant column
plus that tenant's OAuth clients) and maps custom domains and tenant ids to slugs. `configureApp`
uses a per-request CORS delegate: the `Origin` is allowed when it is in `CORS_ORIGINS` (platform
fallback: portal, superadmin and setup routes, plus the existing first-run bootstrap origins) or in
the allow-list of the tenant the request resolves to, using the same priority as
`TenantResolverMiddleware` (custom domain, subdomain, `x-tenant-slug`, `x-tenant-id` when permitted;
the hostname parsing now lives in one shared helper). Unknown tenants and tenant-less routes get only
the fallback. Credentials behaviour is unchanged.

Origins are validated by one function (`common/security/cors-origin.ts`) both when saved and when
loaded: scheme + host + port only, `https` except `localhost`/`127.0.0.1`, no wildcards, `null`,
paths, credentials or trailing slash. Tenant admins manage the list with
`GET|PUT /tenants/current/allowed-origins` (`tenant:read` / `tenant:write`, audited).

### Preflight limitation
Browsers never send custom headers (`x-tenant-slug`) on a preflight, so a preflight whose host does
not identify a tenant cannot be attributed. Such preflights (only `OPTIONS` with
`Access-Control-Request-Method`) are answered from the union of all tenants' lists. This only lets the
browser proceed: the actual request is re-checked against its own tenant and is refused without
`Access-Control-Allow-Origin`, so a tenant's origin still cannot be used for another tenant. Tenants on
their own subdomain or custom domain get a strict preflight.

## Consequences
- Tightening: deployments that relied on one tenant's origin working for all tenants must list the
  origin per tenant or in `CORS_ORIGINS`.
- No DB work per request; edits apply at once on the handling instance (`refreshTenant`) and within
  60 s on other instances (periodic full refresh).
- Legacy stored values that are not canonical origins (paths, trailing slash) are skipped with a
  warning; they never matched a browser `Origin` anyway.

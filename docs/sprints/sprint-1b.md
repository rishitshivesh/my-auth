# Sprint 1b — RSA Key Persistence & Schema-Per-Tenant Foundation

**Status:** ✅ Complete  
**Goal:** Replace ephemeral in-memory RSA keys with persisted key pairs; lay the schema-per-tenant groundwork.

---

## What was delivered

### RSA key persistence
- RSA 2048-bit key pairs now stored in the `public.key_pairs` table (PEM-encoded, encrypted at rest with AES-256-GCM using `KEYRING_MASTER_KEY`).
- On startup, `KeyPairService` checks for an active key pair. If none exists, generates one and persists it.
- Key rotation: new keys can be added; old keys remain in the table for verification until explicitly retired.
- All issued JWTs use RS256 and carry a `kid` (key ID) header matching the database record.

### JWKS endpoint
- `GET /.well-known/jwks.json` — public endpoint, no auth required.
- Returns all active public keys in JWK format (n, e, kid, alg, use).
- Response cached in Redis for `JWKS_CACHE_SECONDS` (default 300s).
- External services and SDKs can verify JWTs without contacting Sentry's private keys.

### Schema-per-tenant foundation
- Each tenant gets a dedicated PostgreSQL schema: `fk_{slug}`.
- `TenantSchemaService` provides:
  - `getSchemaName(slug)` → `"fk_{slug}"`
  - `schemaExists(slug)` → boolean
  - `createSchema(slug)` → provisions all tenant tables in the new schema
- Schema provisioned on tenant creation; tables match the public schema entity definitions.

### TenantResolverMiddleware
- Runs on every request before any guard or controller.
- Resolves tenant slug from:
  1. `X-Tenant-Slug` header (dev + `ALLOW_TENANT_ID_HEADER=true` only)
  2. Subdomain (e.g., `acme.sentry.scrolloop.com` → slug `acme`)
  3. Path prefix (e.g., `/t/acme/...` → slug `acme`)
- Sets `req.tenant = { id, slug, name, ... }` for downstream use.
- Returns `404` if tenant not found; `400` if resolution is ambiguous.

---

## Files changed

| File | Change |
|------|--------|
| `packages/database/src/entities/key-pair.entity.ts` | NEW — RSA key storage entity |
| `packages/database/src/migrations/...-AddKeyPairs.ts` | NEW — creates `key_pairs` table |
| `apps/auth-service/src/core/keys/key-pair.service.ts` | NEW — generate, persist, load key pairs |
| `apps/auth-service/src/modules/oauth/oauth.controller.ts` | JWKS endpoint |
| `apps/auth-service/src/core/tenant/tenant-schema.service.ts` | NEW — schema lifecycle management |
| `apps/auth-service/src/common/midllewares/tenant-resolver.middleware.ts` | NEW — request-level tenant resolution |

---

## Key architectural decisions

| Decision | Reason |
|----------|--------|
| RS256 (asymmetric) over HS256 | External services can verify JWTs without sharing a secret |
| Keys in DB, encrypted | Survive restarts; encrypted so DB breach doesn't expose signing keys |
| Schema-per-tenant | Strongest PostgreSQL isolation; row-level isolation retained as defense-in-depth |
| Slug-based resolution | UUIDs change on `db:reset`; slugs are human-readable and stable |

# ADR-0004: Per-tenant signing keys

- Status: Accepted
- Date: 2026-10-11

## Context
`JwksService.getCurrentSigningKey(tenantId)` already prefers a tenant-specific active key over
the platform key when one exists, and `rotateKey(tenantId?)` already retires the old key and
generates a new one, tenant-aware. `getVerificationKeys()` already includes both `active` and
`retired` keys. None of that was ever exercised for a real tenant, though: provisioning never
calls key generation for a new tenant, so every tenant has always fallen through to the shared
platform key — including for the SAML IdP signing key SAML SSO (P0-3) inherited and explicitly
flagged as a known limitation.

## Options considered
1. **Generate a real key at tenant provisioning, with scheduled rotation and a grace period**
   (`KEY_ACTIVE_TTL_DAYS`, `KEY_ROTATION_GRACE_DAYS`).
2. One platform key by design — no per-tenant keys at all.

## Decision
**Option 1.** Most of it already existed (tenant-aware lookup, rotation method, retired-key
verification) — finishing it is less work than it would take to justify ripping that logic back
out for option 2. It also closes the cross-tenant signing-key-sharing gap P0-3 documented but
deferred: SAML assertions, JWTs, and OAuth tokens for different tenants no longer share key
material once every tenant has its own key.

## Implementation
- `KEY_ACTIVE_TTL_DAYS` (default 90) and `KEY_ROTATION_GRACE_DAYS` (default 7) are new env vars
  (`env.validation.ts` / `.env.example`), read by `JwksService` and the new `KeyRotationService`.
- `JwksService.ensureTenantKeyExists(tenantId)` is called right after a tenant (and its schema)
  are created, in both tenant-creation paths (`admin.service.ts#createTenant` and
  `tenant-registration.service.ts`). It's idempotent — a no-op if the tenant already has an
  active key.
- `KeyRotationService` (new, `@Cron` daily, mirrors `TokenCleanupService`'s per-tenant iteration
  via `TenantJobRunner.forEachActiveTenant`, including its cluster-wide advisory lock) does two
  things per active tenant, plus once for the platform key:
  - **Rotate-if-due**: if the active key is older than `KEY_ACTIVE_TTL_DAYS`, retire it and
    generate a new one. If a tenant somehow has *no* active key (every tenant created before
    this shipped), this same step provisions one — a scheduled backfill rather than a one-off
    migration script, so it self-heals without an explicit data migration.
  - **Grace cleanup**: a `retired` key older than `KEY_ROTATION_GRACE_DAYS` past its
    `retiredAt` is marked `revoked`, which removes it from `getVerificationKeys()`'s
    `active`/`retired` filter — a token signed with it stops verifying only after the grace
    window closes.
- `JwksService.getJWKS()` (a hardcoded single-platform-key method, never called by any
  controller — both real JWKS endpoints already use `getVerificationKeys()`, which already
  handles active+retired+tenant-scoped keys correctly) was dead code and is removed rather than
  fixed.

## Consequences
- Tenants created before this ships get their dedicated key on the next rotation-job tick
  (within 24h), not instantly — acceptable since they were sharing the platform key safely
  until then anyway.
- **Security review follow-ups, all fixed before merge:**
  - Platform-key rotation initially ran unlocked across replicas (the per-tenant advisory lock
    only covered the tenant loop) — this was first accepted here as "harmless double-rotation
    churn," but a follow-up review correctly identified it as a real race: two replicas could
    each decide the platform key is due, both generate a new "active" row, and leave two
    simultaneously-active platform keys with nothing to reconcile them (not just harmless churn).
    Fixed: `TenantJobRunner.runExclusive()` is now a public, reusable version of the same
    cluster-wide advisory lock `forEachActiveTenant` already used internally; platform-key
    rotation runs under it (job name `key-rotation-platform`). `dailyRotation()` also gained a
    top-level try/catch so a failure (e.g. a misconfigured `KEYRING_MASTER_KEY`) is logged loudly
    instead of vanishing as an unhandled cron rejection.
  - The in-memory signing-key cache (`JwksService.signingKeys`) was originally trusted
    indefinitely once populated. Since rotation now runs automatically and only updates the
    cache of the replica that performed it (the one holding the advisory lock that tick), every
    *other* replica would have kept signing with a key the DB considered retired, then revoked
    after the grace window — meaning tokens that replica issued would become unverifiable
    everywhere. Fixed: the cache now re-validates against the DB every `CACHE_FRESHNESS_MS`
    (5 minutes) instead of trusting a cached key forever, bounding the staleness window instead
    of leaving it open indefinitely. Covered by a dedicated test simulating a rotation performed
    by "another replica."
  - `ensureTenantKeyExists()` can provision a key before a later step in tenant registration
    fails; `key_pairs` has no FK/cascade to `tenants`, so a failed registration left an encrypted
    private key behind permanently for a tenant that no longer exists. Fixed: added
    `JwksService.deleteTenantKeys()`, called from `cleanupFailedRegistration()` alongside the
    existing schema-drop and tenant-row-delete rollback steps.

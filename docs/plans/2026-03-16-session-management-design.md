# Session Management — Design Document

**Date:** 2026-03-16
**Scope:** Session entity, cleanup job, logout hardening, refresh token rotation
**Constraint:** Changes limited to session-related files only

---

## Decisions

| Question | Decision |
|---|---|
| `token_hash` vs `access_token_hash` | Keep `token_hash` as-is — treated as access token hash, no rename migration |
| `refreshExpiresAt` location | Stays on `oauth_refresh_tokens` table — not denormalized onto sessions |
| `last_activity` vs `lastUsedAt` | Keep `last_activity` as-is — treated as last used at in service layer |

---

## 1. Schema Changes

### New column on `sessions`

```
application_id  uuid  nullable  FK → oauth_clients(id)  ON DELETE SET NULL
```

All other required fields (`token_hash`, `refresh_token_hash`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`, `created_at`, `last_activity`) already exist on the entity.

### New index on `sessions`

```sql
CREATE INDEX idx_sessions_cleanup ON sessions (expires_at, revoked_at);
```

Supports the cleanup query `WHERE expires_at < NOW() AND revoked_at IS NULL` without a full table scan.

One TypeORM migration file covers both the column and the index.

---

## 2. Service Changes

### `cleanupExpiredSessions()` — `SessionManagementService`

Single database transaction:
1. Collect session IDs where `expiresAt < NOW() AND revokedAt IS NULL`
2. Soft-delete those sessions (`deletedAt = NOW()`) — rows retained for audit
3. Revoke associated `oauth_refresh_tokens` for those IDs (`revokedAt = NOW()`, `revokedReason = 'session_expired_cleanup'`)
4. Remove those session keys from Redis cache

### Logout (`revokeSession`) hardening

The existing method already sets `revokedAt`. Additional step: after setting `revokedAt`, call `revokeSessionTokens(sessionId)` and set `refreshTokenHash = NULL` on the session row. This closes the window where a revoked session's refresh token remains usable.

### Refresh token rotation

No logic changes — `OAuthRefreshTokenService.rotateRefreshToken()` already correctly sets `usedAt`, issues a new token, and revokes the family on reuse detection. Covered by a regression test to lock in the contract.

---

## 3. Scheduled Cleanup

New cron method in `TokenCleanupService` (existing file):

```
@Cron('*/15 * * * *', { timeZone: 'UTC' })
async fifteenMinuteCleanup()
```

Calls `SessionManagementService.cleanupExpiredSessions()`. Uses existing `@nestjs/schedule` — no new library introduced. Existing hourly/daily token cleanup jobs are unchanged.

---

## 4. Tests

New file: `apps/auth-service/src/modules/session/session-management.service.spec.ts`

| Test | Setup | Assertion |
|---|---|---|
| Cleanup removes only expired non-revoked sessions | Seed 3 sessions: expired+unrevoked, expired+revoked, active | Only the first is soft-deleted; others untouched |
| Logout marks session as revoked | Create active session, call `revokeSession()` | `revokedAt` set, `refreshTokenHash` NULL, Redis key gone |
| Double-use of refresh token is rejected | Rotate once (sets `usedAt`), rotate again with same token | Second call throws; entire token family is revoked |

Uses existing Jest test infrastructure — no new test libraries.

---

## Files Touched

| File | Change |
|---|---|
| `packages/database/src/entities/session.entity.ts` | Add `applicationId` column |
| `packages/database/src/migrations/<timestamp>-AddSessionApplicationId.ts` | New migration |
| `apps/auth-service/src/modules/session/session-management.service.ts` | Add `cleanupExpiredSessions()` |
| `apps/auth-service/src/common/service/session.service.ts` | Harden `revokeSession()` to null `refreshTokenHash` |
| `apps/auth-service/src/modules/auth/token-cleanup.service.ts` | Add 15-minute cron calling cleanup |
| `apps/auth-service/src/modules/session/session-management.service.spec.ts` | New test file (3 specs) |

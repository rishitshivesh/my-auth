# Session Management

Fort Knox tracks every login as a named session tied to a device, IP, and browser. Sessions are stored in PostgreSQL (permanent record) and Redis (fast validation cache).

---

## Session Entity

Table: `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | Tenant FK |
| `user_id` | uuid | User FK |
| `token_hash` | varchar(255) | SHA-256 of the access token |
| `refresh_token_hash` | varchar(255) | SHA-256 of the current refresh token. Nulled on revocation. |
| `refresh_token_family_id` | uuid | Links the refresh token rotation chain |
| `application_id` | uuid, nullable | OAuth client that initiated the session |
| `device_id` | varchar(100) | Browser fingerprint |
| `device_info` | jsonb | `{ browser, os, device, fingerprint }` |
| `ip_address` | varchar(45) | IPv4 or IPv6 |
| `location` | varchar(255) | Geo-resolved city + country |
| `user_agent` | text | Raw User-Agent header |
| `last_activity` | timestamptz | Updated on every validated request |
| `last_refresh_at` | timestamptz | When the refresh token was last rotated |
| `expires_at` | timestamptz | Session lifetime (default 7 days) |
| `revoked_at` | timestamptz | Set on logout |
| `revoked_reason` | varchar(255) | e.g. `user_logout`, `user_logout_all` |
| `created_at` | timestamptz | When the session was created |
| `deleted_at` | timestamptz | Soft-delete timestamp (set by cleanup cron) |

**Indexes:**
- `(tenant_id, user_id)` — user session list queries
- `(tenant_id, refresh_token_hash)` — refresh token lookup
- `(tenant_id, revoked_at)` — active session filter
- `(token_hash)` unique — session lookup by token
- `(expires_at)` WHERE `revoked_at IS NULL AND deleted_at IS NULL` — cleanup query (partial index)
- `(refresh_token_family_id)` — family revocation

---

## Session Lifecycle

### 1. Creation

When a user logs in successfully, `SessionService.createSession()`:

1. Inserts a row in `sessions` with `expires_at = NOW() + SESSION_TTL` (default 7 days)
2. Generates a refresh token: `crypto.randomBytes(32).toString("hex")`
3. Stores `SHA-256(refreshToken)` as `refresh_token_hash`
4. Writes the session to Redis with TTL = SESSION_TTL seconds

### 2. Validation

Every protected request runs through `SessionService.validateSession()`:

1. Check Redis (fast path): if found and not expired, extend TTL and return
2. Cache miss: query PostgreSQL with `WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`
3. Check `expires_at < NOW()` — if expired, return null (do not update Redis)
4. Rebuild Redis cache; update `last_activity` asynchronously

### 3. Refresh token rotation

When `/auth/refresh` is called:

1. Hash the incoming refresh token
2. Find it in `oauth_refresh_tokens`
3. **Reuse detection**: if `used_at` is already set → revoke the entire family → throw 401
4. Check `revoked_at` and `expires_at`
5. Check the linked session is not revoked
6. Mark old token as `used_at = NOW()`
7. Issue new token: new random 32 bytes, same `family_id`, `parent_token_id` = old token id
8. Update `refresh_token_hash` and `last_refresh_at` on the session row
9. Extend Redis TTL

### 4. Revocation (logout)

`SessionService.revokeSession()`:

1. `UPDATE sessions SET revoked_at = NOW(), revoked_reason = ?, refresh_token_hash = NULL WHERE id = ? AND tenant_id = ?`
2. `DELETE` the Redis key
3. `UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE session_id = ?`

Note: `refresh_token_hash` is explicitly nulled — not just set alongside `revoked_at`. This closes a window where a captured refresh token could still be exchanged before the `oauth_refresh_tokens` revocation propagates.

### 5. Cleanup cron

`TokenCleanupService.fifteenMinuteSessionCleanup()` runs every 15 minutes:

1. Find sessions where `expires_at < NOW() AND revoked_at IS NULL AND deleted_at IS NULL`
2. Inside a single transaction:
   - `softDelete(Session, ids)` — sets `deleted_at = NOW()`
   - `UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE session_id IN (ids) AND revoked_at IS NULL`
3. Sessions are never hard-deleted — soft-delete preserves the audit trail.

Redis entries for these sessions will have already expired via TTL (their TTL matches `expires_at`).

---

## Session API

All endpoints require `Authorization: Bearer <accessToken>`.

### List active sessions

```
GET /sessions/active
```

Returns all active sessions (not revoked, not expired) for the current user:

```json
[
  {
    "id": "...",
    "deviceInfo": { "browser": "Chrome", "os": "macOS 14", "type": "desktop" },
    "location": { "city": "San Francisco", "country": "US", "timezone": "America/Los_Angeles" },
    "ipAddress": "1.2.3.4",
    "lastActivity": "2026-03-16T10:00:00Z",
    "createdAt": "2026-03-01T00:00:00Z",
    "isCurrent": true,
    "tokenFamily": { "familyId": "...", "tokensInFamily": 3, "lastUsed": "..." }
  }
]
```

`isCurrent: true` marks the session that issued the access token making the request.

### Revoke a specific session

```
DELETE /sessions/:sessionId
```

Useful for "logout of my iPhone" from the devices list.

### Logout all other sessions

```
DELETE /sessions/all/other
```

Revokes all sessions except the current one. Useful after a password change.

### Logout all sessions

```
DELETE /sessions/all
```

Revokes every session including the current one. A "panic button" for compromised accounts.

---

## Redis Caching Strategy

Sessions use Redis for fast lookup without hitting PostgreSQL on every request.

```
Key: {tenantId}:session:{sessionId}
Value: { id, userId, tenantId, email, refreshTokenFamilyId, ipAddress, userAgent, deviceId, createdAt, expiresAt }
TTL: SESSION_TTL seconds (default 604800 = 7 days)
```

- **Cache hit**: TTL is extended on every access — active sessions stay warm
- **Cache miss**: PostgreSQL lookup, rebuild cache
- **Revocation**: Key deleted immediately; no TTL expiry window

---

## Security Properties

| Property | How it is enforced |
|---|---|
| Session bound to tenant | Every query filters by `tenant_id` |
| Post-logout replay impossible | `refresh_token_hash` nulled on revocation |
| Token reuse detection | `used_at` on `oauth_refresh_tokens` — reuse revokes the family |
| Expired sessions don't accumulate | 15-minute cron soft-deletes expired rows |
| Device visibility | `device_info` JSONB stored per session — shown in the portal |
| Concurrent session limit | Not enforced at the DB level — configurable per tenant (planned) |

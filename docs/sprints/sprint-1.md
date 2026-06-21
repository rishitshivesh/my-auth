# Sprint 1 — Security Hardening

**Status:** ✅ Complete  
**Goal:** Bring auth service up to production security baseline before any feature work.

---

## What was delivered

### CORS hardening
- Replaced permissive wildcard CORS with `CORS_ORIGINS` env var (comma-separated list).
- Added Helmet middleware for standard HTTP security headers (CSP, HSTS, noSniff, etc.).
- Admin portal origin separately controlled via `ADMIN_PORTAL_ORIGIN`.

### Structured logging (Pino)
- Eliminated all `console.log` / `console.error` calls across auth-service.
- Every NestJS service now uses `this.logger = new Logger(ServiceName.name)`.
- Log output is structured JSON (Pino), ready for log aggregation.

### Secrets moved to env vars
- `SESSION_SECRET` (express-session) — previously hardcoded string, now required env var.
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — required at startup; process exits if missing.
- `MASTER_ENCRYPTION_KEY` — used for AES-256-GCM token encryption.
- All vars documented in `.env.example`.

### OAuth client validation
- `POST /oauth/token` now validates `client_id` and `client_secret` against stored `OAuthClient` records.
- Unknown or inactive clients receive `401 Unauthorized`.
- Client secrets stored as Argon2id hashes.

### Rate limiting
- `SlidingWindowRateLimiter` implemented using Redis atomic Lua scripts.
- Applied to: `POST /auth/login`, `POST /auth/register`, `POST /mfa/verify/totp`, `POST /auth/magic-link`.
- Config: 10 attempts per 15-minute window by default; configurable via env.
- Rate limit headers returned (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

---

## Files changed

| File | Change |
|------|--------|
| `apps/auth-service/src/core/modules/global/index.ts` | Helmet + CORS from env |
| `apps/auth-service/src/modules/auth/auth.service.ts` | console.log → Pino |
| `apps/auth-service/src/modules/oauth/oauth.controller.ts` | Client validation |
| `apps/auth-service/src/common/rate-limit/sliding-window.ts` | NEW — Redis Lua rate limiter |
| `.env.example` | All new required vars documented |

---

## Verification

```bash
grep -r "console\." apps/auth-service/src --include="*.ts" --exclude-path="*/seeder/*"
# must return empty

curl -H "Origin: http://evil.com" http://localhost:4000/auth/login
# must receive CORS error (not allowed)
```

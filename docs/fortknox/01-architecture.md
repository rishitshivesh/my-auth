# Architecture Overview

Fort Knox is a monorepo containing a NestJS authentication backend, a Next.js admin portal, a multi-platform SDK, and shared packages. Everything is multi-tenant by design — every database table carries a `tenant_id` column, and no query crosses tenant boundaries.

---

## System Diagram

```
Browser / Mobile App
       │
       ▼
┌─────────────────────────────────┐
│         admin-portal            │  Next.js 15
│  (login, dashboard, settings)   │  Port 3000
└───────────────┬─────────────────┘
                │ HTTPS (REST)
                ▼
┌─────────────────────────────────┐
│         auth-service            │  NestJS 11
│                                 │  Port 4000
│  ┌──────────┐  ┌─────────────┐  │
│  │  Auth    │  │   OAuth2    │  │
│  │  Module  │  │   Module    │  │
│  ├──────────┤  ├─────────────┤  │
│  │  MFA     │  │   RBAC      │  │
│  │  Module  │  │   Module    │  │
│  ├──────────┤  ├─────────────┤  │
│  │ Session  │  │   Social    │  │
│  │ Module   │  │   Auth      │  │
│  ├──────────┤  ├─────────────┤  │
│  │  User    │  │   Tenant    │  │
│  │  Module  │  │   Module    │  │
│  └──────────┘  └─────────────┘  │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │  Redis   │  │ PostgreSQL  │  │
│  │  Cache   │  │  (TypeORM)  │  │
│  └──────────┘  └─────────────┘  │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│        fortknox-sdk             │
│  React / Next.js / Node / Web   │
└─────────────────────────────────┘
```

---

## Packages

### apps/auth-service

The core backend. Every auth flow lives here. Built with NestJS modules, each module encapsulating a domain:

| Module | Responsibility |
|---|---|
| `auth` | Login, register, logout, refresh, magic link, password reset |
| `mfa` | TOTP, email OTP, WebAuthn registration and management |
| `oauth` | OAuth2 authorization server, OIDC, client management |
| `social-auth` | Google / GitHub / Microsoft login and account linking |
| `session` | Session list, analytics, revocation per device |
| `user` | Profile, password change, account deletion, admin user ops |
| `tenant` | Tenant creation, branding, custom domain |
| `rbac` | Roles, permissions, user-role assignments |
| `email` | SMTP / SES delivery, template rendering |
| `dashboard` | User dashboard overview + tenant settings |

Cross-cutting concerns live in `src/common/`:

| Service | Responsibility |
|---|---|
| `SessionService` | Low-level session create/validate/revoke + Redis cache |
| `RedisService` | Namespaced Redis get/set/delete/TTL |
| Guards | `JwtAuthGuard`, `SessionGuard`, `TenantBindingGuard` |
| Middleware | `TenantResolverMiddleware` — resolves tenant from subdomain or header |

Cron jobs in `TokenCleanupService`:
- Every 15 minutes: `cleanupExpiredSessions()` — soft-deletes expired sessions, revokes tokens
- Every hour: `hourlyCleanup()` — deletes expired `oauth_refresh_tokens`
- Daily at 2 AM UTC: `dailyCleanup()` — per-tenant token cleanup

### apps/admin-portal

Next.js 15 App Router frontend. Routes:

| Route | Description |
|---|---|
| `/u/login` | Email/password, social, passkey login |
| `/u/signup` | Registration |
| `/u/magic-link` | Magic link request |
| `/u/mfa` | MFA challenge step |
| `/u/reset-password` | Password reset |
| `/u/verify-email` | Email verification |
| `/dashboard` | User profile, stats, last login |
| `/dashboard/security` | Sessions, passkeys, MFA setup |
| `/dashboard/settings/security` | TOTP + passkey management |
| `/t/[slug]/dashboard` | Tenant admin overview (metrics stub) |
| `/t/[slug]/security` | Tenant security settings |
| `/t/[slug]/connections` | Social provider config |
| `/t/[slug]/applications` | OAuth client management |
| `/onboarding/create-tenant` | New tenant setup |

### packages/database

All TypeORM entities and migrations. Entities:

- `User`, `Tenant`, `Session`
- `MfaSettings`
- `SecurityEvent`
- `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`, `OAuthRefreshToken`, `OAuthConsent`
- `Role`, `Permission`, `RolePermission`, `UserRole`
- `UserSocialConnection`, `TenantSocialProvider`, `SocialLinkRequest`

### packages/fortknox-sdk

Multi-platform SDK with six entrypoints:

```
@fortknox/sdk          — main (re-exports everything)
@fortknox/sdk/core     — FortKnoxClient, types, state management
@fortknox/sdk/web      — browser helpers, subdomain detection
@fortknox/sdk/react    — FortKnoxProvider, useAuth, useUser, useSession
@fortknox/sdk/next     — SSR-safe client, cookie injection
@fortknox/sdk/node     — server-to-server M2M client
```

### packages/security

Pure utility package — no NestJS dependency:
- `PasswordService` — Argon2id hash + verify
- `EncryptionService` — AES-256-GCM encrypt/decrypt
- `RateLimiterService` — Redis sliding window + token bucket

### packages/ui

shadcn/ui component library with 60+ components shared across frontends.

---

## Data Flow: Request Lifecycle

```
1. Request arrives at auth-service
2. TenantResolverMiddleware reads X-Tenant-ID header (or subdomain)
   → attaches tenantId to request object
3. Guard validates JWT (if protected route)
   → validates session is not revoked
   → extracts userId, tenantId, sessionId from token claims
4. Controller receives decorated request with user context
5. Service runs business logic — all queries are scoped to tenantId
6. Response interceptor wraps response in { success, data, ... }
```

---

## Token Model

Fort Knox uses two token types:

**Access token (JWT, 15 minutes)**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "tenantId": "tenant-uuid",
  "sessionId": "session-uuid",
  "type": "access",
  "iat": 1700000000,
  "exp": 1700000900
}
```

**Refresh token (opaque hex, 30 days)**
- 32 random bytes, hex-encoded
- SHA-256 hashed before storage
- Stored in `oauth_refresh_tokens` with `familyId` for rotation chain
- Sent as `httpOnly` cookie

On every token refresh, the old refresh token is marked `usedAt = NOW()` and a new one is issued in the same family. If the old token is presented again (after it was already rotated), the entire token family is revoked — this is the refresh token reuse detection mechanism.

---

## Multi-Tenant Design

Every table has a `tenant_id` column. The database never enforces cross-tenant isolation by itself — the application layer ensures every query includes `WHERE tenant_id = ?`.

The tenant is resolved from:
1. `X-Tenant-ID` request header
2. Subdomain: `acme.auth.example.com` → `acme`
3. JWT claim: `tenantId` in the access token

This means a token issued for tenant A cannot be used against tenant B's endpoints — the `tenantId` from the JWT is compared against the resolved request tenant.

---

## Security Architecture

| Concern | Mechanism |
|---|---|
| Password storage | Argon2id (OWASP recommended parameters) |
| Token storage | Never store raw tokens — SHA-256 hash only |
| Sensitive DB fields | `select: false` on `passwordHash`, `totpSecret`, `backupCodes` |
| Session revocation | `revokedAt` timestamp + Redis key deletion + `refreshTokenHash` nulled |
| Replay prevention | Refresh token rotation with reuse detection |
| Brute force | `failedLoginAttempts` counter, exponential lockout via `lockedUntil` |
| Field encryption | AES-256-GCM available in `packages/security` (applied to sensitive OAuth fields) |
| Rate limiting | Redis sliding window per IP and per user |
| WebAuthn replay | `counter` field incremented and verified on each use |

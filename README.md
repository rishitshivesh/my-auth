# Fort Knox Authentication System

Enterprise-grade, multi-tenant authentication platform built with NestJS, TypeORM, PostgreSQL, and Redis.

---

## What is Fort Knox?

Fort Knox is a self-hosted authentication service and SDK. It handles everything from basic email/password login to OAuth2 server, passkeys, TOTP, social login, RBAC, and multi-tenant isolation — so your applications do not have to.

---

## Current State

### Implemented and production-ready

| System | Status | Notes |
|---|---|---|
| Email/password auth | Done | Argon2id, brute-force protection, password history |
| JWT + refresh tokens | Done | 15m access / 30d refresh, token rotation, reuse detection |
| Session management | Done | Redis cache + PostgreSQL, device tracking, 15m cleanup cron |
| Magic link login | Done | Token-based, single-use, 15m TTL |
| Multi-tenancy | Done | Full row-level isolation by `tenant_id` on every table |
| TOTP MFA | Done | QR code setup, 10 backup codes, 2-window time step |
| WebAuthn / passkeys | Done | Registration + authentication via `@simplewebauthn/server` v13 |
| Email OTP MFA | Done | Request + verify endpoints, 10m TTL |
| Backup codes | Done | SHA-256 hashed, 10 per user, one-time use |
| Social login | Done | Google, GitHub, Microsoft via Passport.js |
| Social account linking | Done | Link/unlink with email-collision detection |
| OAuth2 server | Done | Authorization code (+ PKCE), refresh token, client credentials |
| OIDC | Done | Discovery, JWKS, UserInfo, ID tokens, introspection, revocation |
| RBAC | Done | Roles, permissions, user-role assignments with expiry |
| Admin portal | Done | Next.js 15 dashboard — profile, security, sessions, passkeys, social connections |
| fortknox-sdk | Done | React hooks, Next.js SSR helpers, Node M2M client, Web helpers |
| Tenant branding | Done | Per-tenant logo, colors, company name, support links |
| Security event log | Done | 37 event types across all flows |
| Email delivery | Done | SMTP (Nodemailer) + AWS SES, auto-detected by config |

### Known gaps / planned work

| Gap | Detail |
|---|---|
| SMS OTP | Entity fields exist, no implementation |
| Tenant admin dashboard metrics | Shows hardcoded mock values — no real DB queries behind them |
| WebAuthn challenge storage | In-memory Map — must move to Redis before multi-instance deploy |
| SAML 2.0 | Not started |
| SCIM provisioning | Not started |

---

## Monorepo Layout

```
my-auth/
├── apps/
│   ├── auth-service/          # NestJS backend — all auth logic
│   └── admin-portal/          # Next.js 15 frontend dashboard
├── packages/
│   ├── database/              # TypeORM entities + migrations
│   ├── security/              # Argon2, AES-256-GCM, rate limiter
│   ├── fortknox-sdk/          # Multi-platform client SDK
│   ├── shared/                # Shared types, DTOs, constants
│   └── ui/                    # shadcn/ui component library
├── docs/
│   ├── plans/                 # Implementation plans
│   └── fortknox/              # Developer guides
├── turbo.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS 11, TypeScript 5.7 |
| Database | PostgreSQL 16, TypeORM 0.3 |
| Cache | Redis 7, ioredis 5 |
| Scheduling | @nestjs/schedule (cron) |
| Password hashing | Argon2id |
| Token format | JWT (access) + opaque random hex (refresh) |
| Encryption | AES-256-GCM |
| WebAuthn | @simplewebauthn/server v13.2.2 |
| Social auth | Passport.js (google-oauth20, github, microsoft) |
| Frontend | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| Build | Turborepo, tsup |
| Package manager | Yarn workspaces |

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7
- Yarn

### 1. Install

```bash
git clone <repo>
cd my-auth
yarn install
```

### 2. Configure auth-service

```bash
cp apps/auth-service/.env.example apps/auth-service/.env
```

Minimum required variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=fort_knox

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT — change in production
JWT_SECRET=change-me-in-production

# URLs
FRONTEND_URL=http://localhost:3000
PORTAL_URL=http://localhost:3000
AUTH_SERVICE_URL=http://localhost:4000
BASE_URL=http://localhost:4000

# WebAuthn
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000

# Email (SMTP or SES — at least one required)
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@fortknox.local
```

### 3. Run migrations

```bash
cd apps/auth-service
yarn db:migrate
```

### 4. Start

```bash
# All apps
yarn dev

# Auth service only
yarn dev --filter=auth-service

# Admin portal only
yarn dev --filter=admin-portal
```

Auth service runs on `http://localhost:4000`.
Admin portal runs on `http://localhost:3000`.

---

## API Overview

Full documentation in [docs/fortknox/](docs/fortknox/).

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Email/password login |
| POST | `/auth/login-intent` | — | Check auth methods for email |
| POST | `/auth/logout` | JWT | Revoke session |
| POST | `/auth/refresh` | Cookie | Rotate refresh token |
| GET | `/auth/me` | JWT | Current user + session |
| POST | `/auth/forgot-password` | — | Send reset OTP |
| POST | `/auth/reset-password` | — | Apply new password |
| POST | `/auth/verify-email` | — | Verify email address |
| POST | `/auth/magic-link/send` | — | Send magic link |
| POST | `/auth/magic-link/verify` | — | Login via magic link |
| POST | `/auth/mfa/verify` | — | Complete MFA (TOTP) |
| POST | `/auth/mfa/verify-backup` | — | Complete MFA (backup code) |
| POST | `/auth/webauthn/login/start` | — | WebAuthn challenge |
| POST | `/auth/webauthn/login/finish` | — | WebAuthn verify + login |

### MFA (all require JWT)

| Method | Path | Description |
|---|---|---|
| GET | `/mfa/status` | Current MFA configuration |
| POST | `/mfa/setup/totp` | Generate TOTP QR + backup codes |
| POST | `/mfa/verify/totp` | Enable TOTP |
| DELETE | `/mfa/totp` | Disable TOTP |
| POST | `/mfa/backup-codes/regenerate` | New backup codes |
| POST | `/mfa/request-email-otp` | Send OTP email |
| POST | `/mfa/verify-email-otp` | Verify OTP email |
| POST | `/mfa/webauthn/register/start` | Passkey registration challenge |
| POST | `/mfa/webauthn/register/finish` | Complete passkey registration |
| GET | `/mfa/webauthn/credentials` | List registered passkeys |
| DELETE | `/mfa/webauthn/credentials/:id` | Remove passkey |

### OAuth2 / OIDC

| Method | Path | Description |
|---|---|---|
| GET | `/.well-known/openid-configuration` | OIDC discovery |
| GET | `/oauth/jwks` | Public keys |
| GET | `/oauth/authorize` | Authorization code flow |
| POST | `/oauth/token` | Token exchange (code, refresh, client_credentials) |
| GET | `/oauth/userinfo` | OIDC user claims |
| POST | `/oauth/introspect` | Token introspection |
| POST | `/oauth/revoke` | Token revocation |
| POST | `/oauth/clients` | Create OAuth client |

### Social Auth

| Method | Path | Description |
|---|---|---|
| GET | `/auth/social/google/login` | Google login redirect |
| GET | `/auth/social/github/login` | GitHub login redirect |
| GET | `/auth/social/microsoft/login` | Microsoft login redirect |
| POST | `/auth/social/claim-session` | Claim token after redirect |
| GET | `/auth/social/connections` | Linked accounts |
| DELETE | `/auth/social/connections/:provider` | Unlink account |

### Sessions (all require JWT)

| Method | Path | Description |
|---|---|---|
| GET | `/sessions/active` | Active devices |
| DELETE | `/sessions/:id` | Revoke session |
| DELETE | `/sessions/all/other` | Logout other devices |
| DELETE | `/sessions/all` | Logout all devices |

---

## Environment Variables Reference

### Required

```env
DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
REDIS_HOST, REDIS_PORT
JWT_SECRET
FRONTEND_URL, PORTAL_URL, AUTH_SERVICE_URL, BASE_URL
WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN
EMAIL_FROM
```

### Email (one of)

```env
# SMTP
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

# AWS SES
AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY
```

### Social providers (each optional — enables that provider)

```env
INTERNAL_GOOGLE_CLIENT_ID, INTERNAL_GOOGLE_CLIENT_SECRET, INTERNAL_GOOGLE_CALLBACK_URL
INTERNAL_GITHUB_CLIENT_ID, INTERNAL_GITHUB_CLIENT_SECRET, INTERNAL_GITHUB_CALLBACK_URL
INTERNAL_MICROSOFT_CLIENT_ID, INTERNAL_MICROSOFT_CLIENT_SECRET, INTERNAL_MICROSOFT_CALLBACK_URL
MICROSOFT_TENANT_ID   # default: "common"
```

---

## Testing

```bash
# Auth service unit tests
cd apps/auth-service && yarn test

# With coverage
cd apps/auth-service && yarn test:cov

# E2E
cd apps/auth-service && yarn test:e2e
```

Current test coverage: session management (5 tests — cleanup, revocation, token reuse).

---

## Database Migrations

```bash
cd apps/auth-service

yarn db:migrate          # run pending
yarn db:migrate:revert   # revert last
yarn db:migrate:show     # show status
yarn db:migrate:generate MigrationName  # generate from entity diff
```

Migrations live in `packages/database/src/migrations/`.

---

## SDK Usage

```typescript
import { createWebClient } from '@fortknox/sdk/web';
import { FortKnoxProvider, useAuth } from '@fortknox/sdk/react';

const client = createWebClient({
  baseURL: 'https://auth.yourapp.com',
  tenant: 'your-tenant-slug',
});

function App() {
  return (
    <FortKnoxProvider client={client}>
      <YourApp />
    </FortKnoxProvider>
  );
}

function LoginButton() {
  const { login, user, isAuthenticated } = useAuth();

  return isAuthenticated
    ? <p>Hello {user?.firstName}</p>
    : <button onClick={() => login({ email, password })}>Login</button>;
}
```

Full SDK reference: [docs/fortknox/09-sdk.md](docs/fortknox/09-sdk.md)

---

## Documentation

[docs/fortknox/](docs/fortknox/) contains the full developer guide:

- [01 — Architecture](docs/fortknox/01-architecture.md)
- [02 — Authentication Flows](docs/fortknox/02-authentication.md)
- [03 — Session Management](docs/fortknox/03-session-management.md)
- [04 — Multi-Factor Authentication](docs/fortknox/04-mfa.md)
- [05 — OAuth2 & OIDC Server](docs/fortknox/05-oauth2-oidc.md)
- [06 — Social Authentication](docs/fortknox/06-social-auth.md)
- [07 — RBAC](docs/fortknox/07-rbac.md)
- [08 — Multi-Tenancy](docs/fortknox/08-multi-tenancy.md)
- [09 — SDK Reference](docs/fortknox/09-sdk.md)
- [10 — Security Events](docs/fortknox/10-security-events.md)

---

## Recent Changes

**2026-03-16 — Session Management Hardening**
- Added `application_id` FK column to sessions table (nullable, references `oauth_clients`)
- Added partial index on `(expires_at) WHERE revoked_at IS NULL AND deleted_at IS NULL`
- Implemented `cleanupExpiredSessions()` — single transaction soft-deletes expired sessions and revokes their refresh tokens
- Added 15-minute cron job in `TokenCleanupService`
- Hardened `revokeSession()` to null `refreshTokenHash` on logout
- Same null applied to both `revokeAllUserSessions()` paths
- 5 regression tests

---

Built by Rishit Shivesh

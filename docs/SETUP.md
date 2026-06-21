# First-Run Setup Guide

This guide covers how to get a fresh Scrolloop Sentry instance running locally from scratch.

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20 LTS | Use `nvm use` if you have `.nvmrc` |
| Yarn | 4 (Corepack) | `corepack enable && corepack prepare` |
| PostgreSQL | 16 | Must be running before any db commands |
| Redis | 7 | Used for sessions, rate-limiting, JWKS cache |

---

## Step-by-step first run

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure environment

```bash
cp apps/auth-service/.env.example apps/auth-service/.env
```

Open `apps/auth-service/.env` and fill in at minimum:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scrolloop_sentry
REDIS_URL=redis://localhost:6379
MASTER_ENCRYPTION_KEY=<run: openssl rand -base64 32>
SESSION_SECRET=<run: openssl rand -base64 32>
GDPR_IP_SALT=<run: openssl rand -base64 32>
JWT_SECRET=<run: openssl rand -base64 32>
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
```

To have the seed create a superadmin account, also set:

```
SEED_SUPERADMIN_EMAIL=admin@example.com
SEED_SUPERADMIN_PASSWORD=ChangeMe123!
```

If these are not set the seed will print a warning and skip superadmin creation. You can always re-run `db:seed` later with the vars set.

### 3. Start the local backing services

```bash
docker-compose up -d   # starts postgres, redis, mailhog
```

### 4. Run database migrations

```bash
cd apps/auth-service
npm run db:migrate
```

This applies all TypeORM migrations in `packages/database/src/migrations/`.

### 5. Seed the database

```bash
npm run db:seed
```

Watch the output for any `CLIENT SECRET` lines — these are shown only once and must be saved immediately.

### 6. Start the auth service

```bash
npm run dev
# or from the monorepo root:
yarn dev --filter=auth-service
```

### 7. Start the admin portal

```bash
# from monorepo root:
yarn dev --filter=admin-portal
```

Open http://localhost:3000/setup to create the first superadmin account.

---

## First-Run via UI

When the auth service boots with no superadmin in the database, it generates a **one-time setup token** and prints it to stdout:

```
=== FIRST RUN SETUP TOKEN: <64 hex chars> ===
Use this token in the X-Setup-Token header when calling POST /superadmin/create-first-admin
```

To retrieve it:

```bash
docker logs auth-service | grep "FIRST RUN SETUP TOKEN"
```

1. Navigate to http://localhost:3000/setup
2. Paste the token into the **Setup Token** field
3. Fill in your name, email address, and a strong password
4. Click **Create Super Admin Account**

The token is **single-use** — it is invalidated immediately after the first superadmin account is created. Restarting the auth service with no superadmin present will generate a new token.

If you skipped the UI setup and used `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` instead, no token is needed — the platform is already initialized and the `/setup` route will redirect you to `/u/login`.

---

## What the seed creates

### Tenants

| Name | Slug | Plan |
|------|------|------|
| Scrolloop Sentry | `sentry` | enterprise |
| Default Organization | `default` | free |
| Acme Corporation | `acme` | professional |
| Startup Inc | `startup` | starter (14-day trial) |

### Roles (per tenant)

`Owner`, `Admin`, `Member`, `Developer`, `Viewer`

The `sentry` tenant also gets a `sentry-internal` system role, which is required for admin-portal access.

### Permissions (per tenant)

26 base permissions covering: user management, role management, permission management, tenant settings, OAuth clients, identity providers, audit logs, and settings.

### OAuth clients (sentry tenant only, in `fk_sentry` schema)

| Client ID | Type | Grant types | Notes |
|-----------|------|-------------|-------|
| `sentry_admin_portal` | public | `authorization_code`, `refresh_token` | PKCE required, first-party |
| `sentry_backend` | confidential | `client_credentials` | M2M, secret printed to stdout once |
| `example_client` | confidential | `authorization_code`, `refresh_token` | Third-party, consent required |

### Superadmin user (optional)

Created in the `fk_sentry` schema when `SEED_SUPERADMIN_EMAIL` and `SEED_SUPERADMIN_PASSWORD` are set. The user is assigned **all** roles in the sentry tenant, including `sentry-internal` and `Owner`.

---

## SEED_SUPERADMIN_* environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SEED_SUPERADMIN_EMAIL` | No | Email address for the first superadmin |
| `SEED_SUPERADMIN_PASSWORD` | No | Password (hashed with Argon2id before storage) |

If either variable is missing the seed skips superadmin creation with a warning. The seed is fully idempotent — running it twice with the same email will not create a duplicate user.

---

## How to log in after seeding

1. Navigate to http://localhost:3000/u/login
2. Enter the email and password from `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`
3. On success you are redirected to the dashboard for the `sentry` tenant

If login fails, check that:
- The auth service is running and reachable
- `SEED_SUPERADMIN_EMAIL` was set before running `db:seed`
- The `sentry-internal` role was created (check seed output)

---

## Full reset

To wipe and re-seed from scratch:

```bash
cd apps/auth-service
npm run db:reset
```

This runs `db:drop` → `db:migrate` → `db:seed` in sequence.

---

## What NOT to do

- **Never run `db:drop` or `db:reset` against a production database.** These commands drop the entire schema.
- **Never commit `.env` files.** Only `.env.example` belongs in version control.
- **Never share or log the `sentry_backend` client secret** after the initial seed output scrolls past. Rotate it via the admin portal if lost.
- **Never set `DATABASE_SSL=true` with `rejectUnauthorized: false` in production.** Use a properly-issued certificate or add your CA to the trust store instead.
- **Never re-use `SEED_SUPERADMIN_PASSWORD` as a real operational password.** Change it immediately after first login.

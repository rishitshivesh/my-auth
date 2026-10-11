# Getting started

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | `nvm use` reads `.nvmrc` |
| Yarn | 4 | `corepack enable` — the version is pinned in `package.json` |
| Docker | any recent | for Postgres, Redis and Mailpit; or run them natively |

## 2. Install and start backing services

```bash
corepack enable
yarn install
docker compose up -d       # postgres:5432, redis:6379, mailpit smtp:1025 ui:8025
```

## 3. Configure the auth service

```bash
cd apps/auth-service
cp .env.example .env
```

Fill the four secrets; the generation command for each is at the top of the file:

| Variable | Generate with |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `KEYRING_MASTER_KEY` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |

To receive email in Mailpit, uncomment `SMTP_HOST=localhost` and `SMTP_PORT=1025`. Without it,
emails are logged instead of sent.

The full contract is `src/config/env.validation.ts`; the service will not boot if a required
value is missing and tells you which one.

## 4. Database

```bash
yarn db:migrate        # applies packages/database/src/migrations
yarn db:seed           # platform tenant "sentry", system roles, permissions, first-party OAuth clients
```

`db:seed` prints client secrets once — store them if you need them. Set
`SEED_EXAMPLE_CLIENTS=true` to also create the demo third-party OAuth client.

## 5. Run

```bash
yarn dev                                   # in apps/auth-service → http://localhost:4000
yarn dev --filter=admin-portal             # from the repo root   → http://localhost:3000
```

On first boot with no superadmin, the service prints:

```
=== FIRST RUN SETUP TOKEN: <64 hex chars> ===
```

It is also written to `~/.sentry/setup.log` (override with `SENTRY_SETUP_LOG_DIR`). Open
http://localhost:3000/setup, paste the token and create the superadmin. The token is single-use.

For CI or scripted environments, set `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` before
`db:seed` instead.

## 6. Verify

```bash
curl -s localhost:4000/health/ready          # {"status":"ok","checks":{"database":"up","redis":"up"},...}
curl -s localhost:4000/.well-known/jwks.json # {"keys":[{...}]}
```

On a fresh database, the full end-to-end check is:

```bash
SETUP_TOKEN=<token from boot log> scripts/smoke-test.sh
```

## Calling tenant-scoped APIs

Every route except `/health*`, `/.well-known/*`, `/superadmin/*` and tenant registration needs a
tenant. Locally, send `X-Tenant-Slug: sentry`. In production, tenants resolve from the
subdomain (`acme.sentry.scrolloop.com`, with `SENTRY_PLATFORM_DOMAIN` set) or a custom domain.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Config validation error: "X" is required` | Add `X` to `.env`; see `.env.example` for format |
| `Database connection not configured` | Set `DB_URL` (or `DATABASE_URL`, or `DATABASE_HOST` + `DATABASE_*`) |
| `404 Tenant not found` | Missing `X-Tenant-Slug` header, or the slug does not exist |
| `503 Tenant schema unavailable` | Migrations not run, or DB unreachable — check `/health/ready` |
| `429 Rate limit exceeded` in dev | Wait, or set `DISABLE_RATE_LIMIT=true` (development only) |
| Everyone rate-limited together in prod | Set `TRUST_PROXY` to your proxy hop count |
| A value in `.env` seems ignored | The app-local `apps/auth-service/.env` wins over a repo-root `.env` |

To start over: `docker compose down -v && docker compose up -d`, then migrate and seed again.

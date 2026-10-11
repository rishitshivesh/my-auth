# Scrolloop Sentry

Multi-tenant identity platform: authentication, MFA, passkeys, OAuth 2.0 / OIDC, social login,
IAM-style authorization, SAML / SCIM / LDAP, and an admin portal. Self-hostable; designed for
SaaS operation at `sentry.scrolloop.com`.

> **Status:** pre-1.0. Core auth flows are verified end-to-end in CI. Open work is tracked in
> [`docs/REMEDIATION_PLAN.md`](docs/REMEDIATION_PLAN.md).

## Repository layout

| Path | What it is |
|---|---|
| `apps/auth-service` | NestJS 11 API — every auth, tenancy, RBAC and protocol endpoint |
| `apps/admin-portal` | Next.js 16 admin console + hosted login pages (`/u/*`) |
| `apps/docs` | Public developer documentation (Fumadocs, port 3001) |
| `packages/database` | TypeORM entities, migrations, the single DB connection builder |
| `packages/security` | Password hashing (Argon2id), AES-256-GCM, rate limiter |
| `packages/sdk-typescript` | `@scrolloop/sdk` — browser / React / Next.js client |
| `packages/admin-client`, `sentry-config`, `sentry-types` | Admin API client, SDK config & shared types |
| `packages/ui`, `shared`, `eslint-config`, `typescript-config` | Shared UI kit and tooling |

## Quick start

Prerequisites: Node 20 (`.nvmrc`), Corepack (Yarn 4), Docker.

```bash
corepack enable && yarn install
docker compose up -d                                  # Postgres 16, Redis 7, Mailpit

cd apps/auth-service
cp .env.example .env                                  # fill the 4 secrets — commands are in the file
yarn db:migrate && yarn db:seed
yarn dev                                              # http://localhost:4000 — prints a FIRST RUN SETUP TOKEN

# second terminal, repo root
yarn dev --filter=admin-portal                        # http://localhost:3000/setup — paste the token
```

Check it: `curl localhost:4000/health/ready` → `{"status":"ok",...}`. Outgoing mail is in Mailpit at
http://localhost:8025. API reference (non-production): http://localhost:4000/api-docs.

## Everyday commands

| Command | Does |
|---|---|
| `yarn typecheck` | Typecheck every workspace |
| `yarn test` | Unit tests |
| `yarn verify` | Typecheck + tests (what CI's first job runs) |
| `scripts/smoke-test.sh` | End-to-end checks against a freshly booted service |
| `yarn workspace auth-service db:migrate:generate <Name>` | Generate a migration |

## Documentation

- [Getting started](docs/getting-started.md) — full local setup and troubleshooting
- [Architecture](docs/architecture.md) — tenancy, request lifecycle, tokens, keys
- [Security](docs/security.md) — controls, threat model notes, compliance readiness
- [Remediation plan](docs/REMEDIATION_PLAN.md) — prioritised open work
- [ADRs](docs/adr/) — recorded decisions
- [Contributor / agent rules](AGENTS.md)
- Public API docs: `yarn dev --filter=docs` → http://localhost:3001

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

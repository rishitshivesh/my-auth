# AGENTS.md — Scrolloop Sentry

Rules for every contributor, human or AI (Claude Code, Gemini, Copilot, …). `CLAUDE.md` imports
this file; there is no other rulebook. Read it fully before changing code.

## 1. Orientation

| Need | Read |
|---|---|
| What exists and how it fits | [`docs/architecture.md`](docs/architecture.md) |
| What to work on next | [`docs/REMEDIATION_PLAN.md`](docs/REMEDIATION_PLAN.md) |
| Why something is the way it is | [`docs/adr/`](docs/adr/) |
| Security expectations | [`docs/security.md`](docs/security.md) |
| UI work | [`docs/ui-process.md`](docs/ui-process.md) |

Only the workspaces listed in the root README exist. Do not reference SDKs, Helm charts or
services that are not in the tree.

## 2. Definition of done

A change is done when **all** of these pass locally:

```bash
yarn workspace auth-service typecheck && yarn workspace auth-service test
yarn workspace admin-portal exec tsc --noEmit      # if the portal or SDK changed
scripts/smoke-test.sh                               # if auth-service runtime behaviour changed
```

…and, where applicable: the env contract, a migration, and docs are updated (§5–§7). CI runs the
same checks plus a real boot against Postgres and Redis.

Work in small, reviewable commits with a body that says *why*. Confirm before large structural
changes (module boundaries, schema strategy, public API shape).

## 3. Backend (apps/auth-service)

**Tenant isolation is the invariant that matters most.**
- Tenant data lives in schema `fk_{slug}`. `TenantSchemaMiddleware` sets `search_path` on a
  request-scoped QueryRunner held in `AsyncLocalStorage` (`TenantContextService`); the
  DataSource proxy in `DatabaseModule` routes repository calls through it.
- Keep `tenant_id` filters in every tenant query (defence in depth) — never remove them.
- Code that runs **outside a request** (cron, queues, CLI) has no tenant context. Use
  `TenantJobRunner.forEachActiveTenant()` / `runInTenant()` — never call tenant repositories
  directly from a job.
- Raw SQL must obtain schema names from `TenantSchemaService.getSchemaName()`, never by
  string-building from user input.

**Module structure**
- `DatabaseModule`, `SharedServicesModule` and `GuardsModule` are `@Global`. Never list their
  services (`RedisService`, `SecurityEventService`, `SessionService`, `JwksService`,
  `OAuthRefreshTokenService`, RBAC services/guards, `TenantContextService`,
  `SessionRepository`) in a feature module's `providers` — that creates duplicate instances.
- A feature module provides only its own services and imports other feature modules for theirs.

**Request handling**
- Every `@Body()` / `@Query()` is a class with `class-validator` decorators. Interfaces and inline
  types bypass the `ValidationPipe`.
- Protect routes with `@Protected()` / `@ProtectedWithPermissions()`; never hand-roll auth checks.
- Auth cookies are set only through `common/http/auth-cookies.ts`.
- Spec-defined payloads (JWKS, OIDC discovery, health) use `@RawResponse()`.
- Missing functionality throws `NotImplementedException`. No fake success responses or mock data.

**Code quality**
- No `console.*` outside seeders/CLI — use the Pino `logger` / Nest `Logger`.
- No `any`. Use `unknown` plus narrowing, or define the type.
- Secrets and tokens are never logged or written to audit metadata.

## 4. Frontend (apps/admin-portal, packages/sdk-typescript)

- Network calls go through the SDK (`authClient`, `adminClient` / `authClient.request`), wrapped
  with `withErrorHandler` (`lib/with-error-handler.ts`). No raw `fetch`/`axios` in the portal.
- Server state via TanStack Query. No `console.*`; surface errors in the UI.
- Styling uses design tokens (CSS variables / Tailwind theme) only — no hard-coded colours,
  spacing or font sizes. Follow `docs/ui-process.md`.
- Keep UI-only changes and backend changes in separate commits.

**Modern, complete user journeys**
- Prefer low-friction, intent-driven flows: clickable email links for email verification,
  invitations and password recovery; offer passkeys and passwordless sign-in where supported.
  Manual email OTP entry is a fallback, not the default verification experience. Keep TOTP,
  recovery codes and other required MFA challenges when they serve a distinct security purpose.
- Email actions must take people to the relevant continuation, retain the intended tenant and
  validated destination, explain what happened, and provide a clear next step. Cover expired,
  already-used, invalid and wrong-account links, resend cooldowns, alternate-device completion,
  cancellation and accessible code fallback. Never silently sign in an unintended account.
- Design links as short-lived, single-use, purpose-bound actions. Email scanners/prefetch must
  not consume a credential or complete a sensitive mutation on GET; use an intentional
  confirmation where required. Do not weaken tenant isolation, authorization or recent-auth
  requirements to make a flow feel simpler.
- Apply progressive disclosure, useful defaults, inline validation, accessible keyboard/focus
  behavior and truthful pending/success/error states. Explain the effect of destructive or
  access-changing actions before confirmation; never imply success before the server confirms.
- Cover the complete lifecycle, not just list pages: user creation/invitation and acceptance,
  verification, role/group/policy assignment and revocation, permission visibility, sessions,
  recovery, suspension/reactivation and deletion. Include loading, empty/no-results, denied,
  conflict, retry, responsive and theme states, with success/failure/cancel prototype exits.
- Track screen, prototype, API mapping and frontend implementation separately in
  `apps/docs/content/docs/dev/screen-ux-checklist/index.mdx`. Figma frames and prototype links
  do not count as implemented or tested application flows. Design proposed missing features
  with explicit handoff requirements; never invent backend support or ship fake success.

## 5. Configuration

- Every environment variable is declared in `apps/auth-service/src/config/env.validation.ts`
  **and** documented in `apps/auth-service/.env.example`. Add both in the same commit.
- No hard-coded URLs, secrets, tenant slugs or UUIDs in source.

## 6. Database

- Schema changes ship as TypeORM migrations in `packages/database/src/migrations`. Never use
  `synchronize`.
- Tenant tables must also be added to tenant provisioning (`TenantSchemaService`).

## 7. Documentation

- Internal engineering docs: `docs/`. Public API/SDK docs: `apps/docs/content/docs/`.
- New or changed endpoint → update the matching `apps/docs` page.
- Significant decisions → new ADR in `docs/adr/` (copy the format of an existing one).
- Do not create session logs, sprint prompts or status files; use commits, PRs and the
  remediation plan.

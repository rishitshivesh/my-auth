# AGENTS.md — Scrolloop Sentry

> Governs AI agent behavior in this repository.
> Applies to Claude Code, Gemini CLI, GitHub Copilot, and all other AI tools.
> Read every line before touching any file. These rules override default agent behavior.

---

## SESSION TRACKING — REQUIRED ON EVERY RUN

At the start of every session, append an entry to `docs/agent-sessions.md`:

```markdown
## Session: YYYY-MM-DD — <model name, e.g. Claude Sonnet 4.6>
**Prompt:** <first user message or task description, verbatim or paraphrased>
**Files touched:** <comma-separated list of modified files>
**Work done:**
- bullet 1
- bullet 2
**Outcome:** completed / partial / blocked
```

This is not optional. Every session must log its work. At the end of a session, update the entry's **Files touched** and **Work done** fields with what was actually done.

---

## WHAT TO READ FIRST (in order)

1. `CLAUDE.md` — full project rules, tech stack, architecture decisions
2. `docs/sprints/sprint-status.md` — what's done, what's in progress
3. `docs/agent-sessions.md` — what prior AI sessions did (avoid duplicating work)

---

## CRITICAL RULES

These match `CLAUDE.md` and are repeated here for agents that may not load CLAUDE.md first.

### No `console.log`
Use `this.logger` (Pino/NestJS Logger) in the backend. No logging in the frontend. Zero exceptions.

### No TypeScript `any`
Define the type or use `unknown` with a type guard. `catch (err: any)` → `catch (err: unknown)`. Run `tsc --noEmit` before committing.

### No mock data
No `setTimeout` fakes, no hardcoded arrays, no `Math.random()` IDs. If an endpoint isn't implemented, throw `NotImplementedException`.

### No hardcoded values
All config comes from environment variables. No hardcoded URLs, secrets, UUIDs, or tenant slugs in source code.

### No `fetch()` in the frontend
All API calls go through the SDK (`authClient` or `adminClient`). No raw `fetch()` or `axios` calls in `apps/admin-portal`.

### No inline styles for design values
CSS variables or Tailwind tokens only. No hardcoded hex colors, pixel values, or font sizes in components.

### Tokens are httpOnly cookies only
Never put access tokens or refresh tokens in response bodies or localStorage.

### Backend and frontend are separate
When doing UI work: do not touch any backend file.
When doing backend work: do not touch any frontend file.

UI files: `apps/admin-portal/**`, `packages/sdk-typescript/src/react/**`
Backend files: everything else.

---

## BEFORE TOUCHING BACKEND

### Tenant isolation — understand this before writing any query

The database uses **two isolation layers simultaneously**:

**Layer 1 — Schema (search_path):** `TenantSchemaMiddleware` runs on every tenant request. It sets `SET search_path TO "fk_{slug}", public` on a dedicated `QueryRunner` stored in `AsyncLocalStorage` via `TenantContextService`. Services use `TenantAwareRepository` which reads from this scoped `EntityManager`.

**Layer 2 — Row-level (tenant_id):** All tenant entities have a `tenant_id` column. All queries retain `WHERE tenant_id = ?`. This is defense-in-depth — a bug in Layer 1 cannot expose Layer 2.

Key files:
- `apps/auth-service/src/core/database/tenant-context.service.ts` — AsyncLocalStorage
- `apps/auth-service/src/core/database/tenant-aware.repository.ts` — base repository
- `apps/auth-service/src/common/midllewares/tenant-schema.middleware.ts` — sets search_path
- `apps/auth-service/src/modules/user/user.repository.ts` — example implementation

When writing a new repository: extend `TenantAwareRepository`. When writing a service: inject the repository, not `@InjectRepository(Entity)` directly.

### JWT payload shape

Every issued JWT includes:
```json
{ "sub": "userId", "tid": "tenantId", "tenantSlug": "acme", "sid": "sessionId",
  "jti": "uuid", "iss": "https://sentry.scrolloop.com/t/{slug}", "aud": "clientId" }
```

### Auth endpoints are public unless decorated

Use `@Public()` for unauthenticated endpoints. All others require a valid JWT.

### IAM policy engine

Use `@UseGuards(PermissionsGuard)` + `@RequirePermissions("resource:action")`. Do not use `if (user.role === 'admin')` checks anywhere.

---

## BEFORE TOUCHING FRONTEND

### Design system — Stitch MCP first

Before writing any component or page:
1. Connect to Stitch MCP: `stitch.getDesignSystem({ name: "scrolloop-sentry" })`
2. Extract token values
3. Reference those values — never invent colors, spacing, or font sizes

### CSS variable reference

```css
--color-bg-base: #F7F6F4
--color-surface-1: rgba(255,255,255,0.68)   /* glass tier 1 */
--color-surface-2: rgba(255,255,255,0.80)   /* glass tier 2 */
--color-text-primary: #1A1916
--color-text-secondary: #4A4845
--color-text-tertiary: #8A8784
--color-accent: #2ABF6C
--color-danger: #C0392B
--color-warning: #C4830A
```

### Data fetching

Use React Query (`useQuery` / `useMutation`) via the hooks in `apps/admin-portal/lib/queries.ts`. All hooks call `authClient.request()` via `withErrorHandler`. No bare `useEffect` for data fetching.

### API response shape

All responses are wrapped: `{ data: T, message?: string, statusCode: number }`. The `withErrorHandler` HOF unwraps this — components receive `T` directly.

---

## ENVIRONMENT

Root `.env` (monorepo root) is loaded by all apps and packages. Key vars:

```
SENTRY_PLATFORM_NAME=Scrolloop Sentry
SENTRY_PLATFORM_SLUG=sentry
NEXT_PUBLIC_AUTH_SERVICE_URL=http://localhost:4000
NEXT_PUBLIC_SENTRY_TENANT_SLUG=sentry
```

Never read env vars that don't go through `apps/auth-service/src/config/env.validation.ts` on the backend.

---

## BEFORE COMMITTING

```bash
# Auth service
cd apps/auth-service && npx tsc --noEmit
grep -r "console\." src --include="*.ts" --exclude-path="*/seeder/*"
grep -r ": any" src --include="*.ts"

# Admin portal
cd apps/admin-portal && npx tsc --noEmit
grep -r "#[0-9A-Fa-f]\{3,6\}" components --include="*.tsx"
grep -r "fetch(" app components --include="*.tsx" --include="*.ts" | grep -v node_modules
```

All checks must return empty output before committing.

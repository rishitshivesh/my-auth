# auth-service

NestJS 11 API for Scrolloop Sentry. Setup: [../../docs/getting-started.md](../../docs/getting-started.md).
Design: [../../docs/architecture.md](../../docs/architecture.md).

| Script | Purpose |
|---|---|
| `yarn dev` | Run with watch (ts-node, transpile-only) |
| `yarn build` / `yarn start:prod` | Compile to `dist/` and run |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn test` / `yarn test:cov` | Unit tests |
| `yarn db:migrate` / `db:migrate:revert` / `db:migrate:show` | Migrations (`packages/database/src/migrations`) |
| `yarn db:migrate:generate <Name>` | Generate a migration from entity changes |
| `yarn db:seed` | Platform tenant, roles, permissions, first-party OAuth clients |
| `yarn db:seed:demo` | Demo data (never in production) |
| `yarn setup` | Interactive first-run CLI |

Environment: every variable is declared in `src/config/env.validation.ts` and documented in
`.env.example`.

Source map:

```
src/
  core/        bootstrap, global modules, database + tenant context, health
  common/      guards, decorators, interceptors, middleware, shared services, cookie policy
  config/      env contract
  modules/     feature modules (auth, mfa, oauth, rbac, tenant, saml, scim, ldap, …)
  database/    seeders and reset script
templates/     email templates (Handlebars)
```

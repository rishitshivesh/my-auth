# Admin portal UI architecture

Conventions for `apps/admin-portal` and `packages/ui`. See also [ui-process.md](ui-process.md).

## Layout

```
apps/admin-portal/
  app/            routes only: compose a view, nothing else
  features/<name>/
    api/          data access: SDK calls (authClient / typed modules) + TanStack Query hooks
    model/        pure functions, types, view-models (no React, no I/O)
    components/   presentational pieces; copy via useCopy(), no string literals
    views/        compose components + api + model into a screen or shell
  components/     cross-feature, app-specific components (legacy dirs are listed as copy debt in eslint.config.js)
  hooks/          thin React wrappers over lib/ logic (useResendCooldown, useRecentAuth, ...)
  lib/            framework-free utilities and the legacy query modules (lib/queries/<domain>.ts)
  i18n/           typed copy catalogue: en/{auth,account,tenant,platform,common,errors,states}.ts
  constants/      routes, query keys, limits, feature flags, navigation
packages/ui/src/components/patterns/   generic, copy-free patterns (props carry all text)
```

Rules:

- Pages in `app/` only import a view and pass route params.
- Dependency direction: `views -> components -> model`; `views -> api`; `api -> lib`. `model/` imports nothing from React.
- User-facing text comes from `i18n/` through `t()` / `useCopy()`; keys are typed from the catalogue. Use `tk()` only for keys chosen at runtime (nav, capability ids). ESLint (`react/jsx-no-literals`) enforces this in `features/` and `components/` (excluding tests and the legacy-debt list).
- All network calls go through the SDK, wrapped by `withErrorHandler`. Raw `fetch`/`axios` is only allowed in `lib/` (and `middleware.ts`).
- Routes, query keys, limits and flags live in `constants/`. Query keys are scoped by tenant and principal: `queryKeys({ tenant, principal }).users.list(...)`.
- Styling uses tokens from `packages/ui/src/globals.css` only (including `success`, `warning`, `info`).
- Permissions in the UI (`usePermission`) only hide or disable; the backend enforces.

## Proposed capabilities

Features without a backend contract are flagged `false` in `constants/feature-flags.ts` and render `ProposedCapabilityView` (Planned badge, TODO handoff list, missing contract). Never show sample data or success states. When the contract lands, add the real feature under `features/<name>/` and flip the flag in the same change.

## Tests

Pure logic and components are tested with jest (`yarn workspace admin-portal test`). Components are server-rendered to markup (`test-utils/render.tsx`) to assert roles and aria wiring; interaction tests need a DOM environment and are not set up yet.

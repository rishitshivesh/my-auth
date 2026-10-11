## What & why

<!-- One paragraph: the problem and the change. Link the remediation-plan item (e.g. P0-3) if any. -->

## How it was verified

- [ ] `yarn workspace auth-service typecheck` and `test` pass
- [ ] `scripts/smoke-test.sh` passes against a fresh database (or N/A)
- [ ] New/changed env vars are in `env.validation.ts` **and** `.env.example`
- [ ] Schema changes ship as a migration in `packages/database/src/migrations`
- [ ] Docs updated (`docs/` for internals, `apps/docs` for public API)

## Security notes

<!-- Auth, tenancy, crypto or PII touched? Say how isolation / least privilege is preserved. -->

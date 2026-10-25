# auth-service e2e tests

Real AppModule, real Postgres, real Redis. Only mail (captured in memory) is replaced.

## Run
    cd apps/auth-service
    yarn test:e2e                 # all e2e specs (maxWorkers 1)
    yarn test:e2e test/e2e/auth   # a subset
    yarn test:all                 # unit + e2e

Postgres and Redis must already be running locally. The DB `scrolloop_sentry_test` is created
automatically (credentials are borrowed from the dev .env, only the DB name changes; override with
`E2E_DATABASE_URL`, which must contain `_test`). Migrations run once in `e2e/global-setup.ts`.
Redis uses DB index 15 with prefix `sentry_e2e`; global setup and `clearRateLimits` delete only rate-limit keys on that index.
The harness refuses to boot if the DB name lacks `_test` or the Redis client is not on index 15.

## Harness (`test/e2e/support`)
- `createTestApp()` -> `{ app, http(opts), db, redis, mail, close() }`. Uses the same `configureApp()` as production.
- `t.http({ tenant, ip, bearer, cookies, headers })` returns `get/post/put/patch/delete`. Each call gets a random
  X-Forwarded-For (TRUST_PROXY=1) so per-IP rate limits do not collide; pass `ip` to share one bucket.
- `t.mail.all() / last(to, template?) / allTo(to) / clear()`; mails are available synchronously.
- `createTenant(t)`, `registerAndVerifyUser(t, tenant)`, `login/loginUser(t, tenant, email, pw)`,
  `extractLink(mail, "/verify-email")`, `tokenFromLink`, `uniqueEmail()`, `uniqueSlug()`, `clearRateLimits(t)`,
  `withTenantHeader(slug)`, `cookiesOf(res)`, `STRONG_PASSWORD`.
- Env defaults live in `e2e/setup-env.ts`. Rate limiting is ON.

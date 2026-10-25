/* Preloaded AFTER apps/auth-service/test/e2e/setup-env.ts so these values win. */
const raw = process.env.E2E_ENV_JSON;
if (raw) {
  for (const [key, value] of Object.entries(JSON.parse(raw))) process.env[key] = String(value);
}
const dbName = new URL(process.env.DB_URL).pathname;
if (!/_test/.test(dbName) || process.env.REDIS_DB !== "15" || process.env.REDIS_KEY_PREFIX !== "sentry_e2e") {
  throw new Error("e2e harness refuses to boot outside the test database / Redis DB 15 / sentry_e2e prefix");
}

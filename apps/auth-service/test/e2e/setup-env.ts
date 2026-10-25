/**
 * Test environment. Imported by jest `setupFiles` AND by global-setup, BEFORE any
 * application code, so that the dev .env files can never point tests at the dev database.
 *
 * Safety rules enforced here:
 *  - the database name must contain `_test`, otherwise we throw
 *  - Redis always uses DB index 15 and the `sentry_e2e` key prefix
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

export const TEST_DB_NAME = "scrolloop_sentry_test";
export const TEST_REDIS_DB = 15;
export const TEST_REDIS_PREFIX = "sentry_e2e";

function readDevEnv(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const rel of ["../../../../.env", "../../../.env"]) {
    const file = path.resolve(__dirname, rel);
    if (fs.existsSync(file)) Object.assign(merged, dotenv.parse(fs.readFileSync(file)));
  }
  return merged;
}

function buildTestDatabaseUrl(dev: Record<string, string>): string {
  const explicit = process.env["E2E_DATABASE_URL"];
  if (explicit) return explicit;
  const devUrl = dev["DB_URL"] ?? dev["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/x";
  const url = new URL(devUrl);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

const dev = readDevEnv();
const databaseUrl = buildTestDatabaseUrl(dev);
if (!/_test/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Refusing to run e2e tests: database name must contain '_test'.");
}

const set = (key: string, value: string): void => {
  process.env[key] = value;
};

set("NODE_ENV", "test");
set("DB_URL", databaseUrl);
set("DATABASE_URL", databaseUrl);
for (const k of ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"]) {
  delete process.env[k];
}
set("DB_SSL", "false");
set("DB_LOGGING", process.env["E2E_DB_LOGGING"] ?? "false");
set("DATABASE_POOL_MAX", "10");
set("DATABASE_POOL_MIN", "1");

set("REDIS_HOST", process.env["E2E_REDIS_HOST"] ?? dev["REDIS_HOST"] ?? "localhost");
set("REDIS_PORT", process.env["E2E_REDIS_PORT"] ?? dev["REDIS_PORT"] ?? "6379");
set("REDIS_PASSWORD", process.env["E2E_REDIS_PASSWORD"] ?? dev["REDIS_PASSWORD"] ?? "");
set("REDIS_USERNAME", "");
set("REDIS_DB", String(TEST_REDIS_DB));
set("REDIS_KEY_PREFIX", TEST_REDIS_PREFIX);

// Deterministic, test-only secrets.
set("JWT_SECRET", "e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret");
set("SESSION_SECRET", "e2e-session-secret-e2e-session-secret-0123");
set("KEYRING_MASTER_KEY", Buffer.alloc(32, 7).toString("base64"));
set("TOKEN_ENCRYPTION_KEY", "ab".repeat(32));
set("GDPR_IP_SALT", "e2e-gdpr-ip-salt-e2e-gdpr-ip-salt-0123");
set("MASTER_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));

set("ISSUER_BASE_URL", "http://localhost:4000");
set("JWT_ISSUER", "http://localhost:4000");
set("FRONTEND_URL", "http://localhost:3000");
set("PORTAL_URL", "http://localhost:3000");
set("CORS_ORIGINS", "http://localhost:3000");
set("PUBLIC_BASE_URL", "http://localhost:4000");
set("AUTH_SERVICE_URL", "http://localhost:4000");

// Rate limits stay ON (never DISABLE_RATE_LIMIT); each request gets its own
// X-Forwarded-For (see TestApp.http) so IP buckets do not collide across tests.
set("DISABLE_RATE_LIMIT", "false");
set("TRUST_PROXY", "1");
// Neutralise anything the dev .env files could otherwise inject (ConfigModule loads them,
// but process.env always wins). Empty string = unset for every consumer.
for (const k of [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "AWS_SES_REGION",
  "AWS_SES_ACCESS_KEY_ID",
  "AWS_SES_SECRET_ACCESS_KEY",
]) {
  set(k, "");
}
for (const k of ["SENTRY_PLATFORM_DOMAIN", "COOKIE_DOMAIN", "SEED_SUPERADMIN_EMAIL", "SEED_SUPERADMIN_PASSWORD"]) {
  delete process.env[k];
}
set("SENTRY_SETUP_LOG_DIR", path.resolve(__dirname, "../../.e2e-setup-log"));
set("ALLOW_TENANT_ID_HEADER", "true");
set("UPLOAD_DIR", path.resolve(__dirname, "../../.e2e-uploads"));
// LDAP e2e dials an in-process server on this machine's LAN address.
set("LDAP_ALLOWED_PRIVATE_CIDRS", "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10");

import * as path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "../..");
export const BACKEND_DIR = path.join(REPO_ROOT, "apps/auth-service");
export const PORTAL_DIR = path.join(REPO_ROOT, "apps/admin-portal");
export const RUNTIME_DIR = path.join(REPO_ROOT, "e2e/.runtime");

/**
 * `.test` is reserved (never resolves publicly). Chromium maps `*.e2e.test` to loopback via
 * --host-resolver-rules and the Node servers via harness/dns-map.cjs, so tenants live on real
 * subdomains and cookies behave like production (shared parent domain, same site).
 */
export const ROOT_DOMAIN = "e2e.test";
export const API_PORT = Number(process.env["E2E_API_PORT"] ?? 4110);
export const PORTAL_PORT = Number(process.env["E2E_PORTAL_PORT"] ?? 3110);
export const SMTP_PORT = Number(process.env["E2E_SMTP_PORT"] ?? 4125);
export const MAIL_HTTP_PORT = Number(process.env["E2E_MAIL_PORT"] ?? 4126);

export const API_ORIGIN = `http://api.${ROOT_DOMAIN}:${API_PORT}`;
export const PORTAL_ORIGIN = `http://${ROOT_DOMAIN}:${PORTAL_PORT}`;
export const MAIL_API = `http://127.0.0.1:${MAIL_HTTP_PORT}`;

/** The service enforces a 30 second minimum for this window. */
export const RECENT_AUTH_WINDOW_SECONDS = 30;
export const PLATFORM_SLUG = "sentry";
export const TEST_REDIS_DB = 15;
export const TEST_REDIS_PREFIX = "sentry_e2e";

/**
 * Each journey owns one tenant, named per run (`e2e-<runId>-<key>` -> schema `fk_e2e_<runId>_<key>`, which the
 * backend's stale-schema sweep removes after 6 hours). The static CORS list must name every portal origin up
 * front, because per-tenant origins may not use plain http for non-localhost hosts.
 */
export const TENANT_KEYS = [
  "signup", "mfa", "reset", "magic", "invite", "account", "console", "iso-a", "iso-b", "a11y", "register", "enroll", "enroll-link", "misc",
] as const;
export type TenantKey = (typeof TENANT_KEYS)[number];

export const tenantSlugFor = (runId: string, key: TenantKey): string => `e2e-${runId}-${key}`;

/** Origin of a tenant's hosted pages and console. */
export const tenantOrigin = (slug: string): string => `http://${slug}.${ROOT_DOMAIN}:${PORTAL_PORT}`;

/** Env handed to the auth-service AFTER apps/auth-service/test/e2e/setup-env.ts (which pins DB/Redis). */
export function backendEnv(runId: string): Record<string, string> {
  const tenantOrigins = TENANT_KEYS.map((key) => tenantOrigin(tenantSlugFor(runId, key)));
  return {
    PORT: String(API_PORT),
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(SMTP_PORT),
    SMTP_SECURE: "false",
    SMTP_USER: "e2e",
    SMTP_PASS: "e2e",
    EMAIL_FROM: "noreply@example.com",
    EMAIL_FROM_NAME: "Sentry E2E",
    FRONTEND_URL: PORTAL_ORIGIN,
    PORTAL_URL: PORTAL_ORIGIN,
    INTERNAL_PORTAL_URL: PORTAL_ORIGIN,
    ISSUER_BASE_URL: API_ORIGIN,
    JWT_ISSUER: API_ORIGIN,
    PUBLIC_BASE_URL: API_ORIGIN,
    AUTH_SERVICE_URL: API_ORIGIN,
    CORS_ORIGINS: [PORTAL_ORIGIN, ...tenantOrigins].join(","),
    COOKIE_DOMAIN: ROOT_DOMAIN,
    // Short step-up window so "sign in again" screens are reachable by waiting seconds, not minutes.
    RECENT_AUTH_WINDOW_SECONDS: String(RECENT_AUTH_WINDOW_SECONDS),
    WEBAUTHN_RP_ID: ROOT_DOMAIN,
    WEBAUTHN_ORIGIN: PORTAL_ORIGIN,
  };
}

export function portalEnv(): Record<string, string> {
  return {
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_AUTH_SERVICE_URL: API_ORIGIN,
    AUTH_SERVICE_URL: API_ORIGIN,
    NEXT_PUBLIC_ROOT_DOMAIN: ROOT_DOMAIN,
    NEXT_PUBLIC_SENTRY_TENANT_SLUG: PLATFORM_SLUG,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

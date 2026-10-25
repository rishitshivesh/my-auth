import { SentryClient } from "@scrolloop/sdk";
import { activeTenantSlug } from "./tenant-host";

const AUTH_SERVICE_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sentry.scrolloop.com";
const DEFAULT_TENANT = process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG ?? "sentry";

const clients = new Map<string, SentryClient>();

/** One client per tenant: the portal serves tenants on subdomains. Hosted sign-in and the console share it. */
export function getTenantClient(slug: string): SentryClient {
  const existing = clients.get(slug);
  if (existing) return existing;
  const created = new SentryClient({
    baseURL: AUTH_SERVICE_URL,
    tenant: slug,
    debug: process.env.NODE_ENV === "development",
  });
  clients.set(slug, created);
  return created;
}

export const platformTenantSlug = DEFAULT_TENANT;

/** Tenant of the page being shown (browser only; the platform workspace on the server). */
export function currentPageTenant(): string {
  if (typeof window === "undefined") return DEFAULT_TENANT;
  return activeTenantSlug(window.location, ROOT_DOMAIN, DEFAULT_TENANT);
}

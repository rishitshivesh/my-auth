import { SentryClient } from "@scrolloop/sdk";
import { resolveTenantSlug } from "../model/tenant";

const clients = new Map<string, SentryClient>();

const AUTH_SERVICE_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sentry.scrolloop.com";
const DEFAULT_TENANT = process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG ?? "sentry";

/** One client per tenant: the portal serves tenants on subdomains. */
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

export function currentTenantSlug(host: string): string {
  return resolveTenantSlug(host, ROOT_DOMAIN, DEFAULT_TENANT);
}

export const destinationDefaults = { rootDomain: ROOT_DOMAIN, apiOrigin: safeOrigin(AUTH_SERVICE_URL) };

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export const authServiceUrl = AUTH_SERVICE_URL;

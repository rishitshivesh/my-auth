/** Tenant resolution for hosted identity: `{slug}.{rootDomain}` or the platform default. */

export function tenantSlugFromHost(host: string, rootDomain: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${rootDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || slug === "app" || slug === "admin") return null;
  return slug;
}

export function resolveTenantSlug(host: string, rootDomain: string, fallback: string): string {
  return tenantSlugFromHost(host, rootDomain) ?? fallback;
}

/** Origin of another tenant's hosted pages, derived from the current location; null off the portal domain. */
export function tenantOrigin(slug: string, location: { protocol: string; host: string }, rootDomain: string): string | null {
  const [hostname = "", port] = location.host.split(":");
  const onPortal = hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
  if (!onPortal) return null;
  return `${location.protocol}//${slug}.${rootDomain}${port ? `:${port}` : ""}`;
}

const CONSOLE_PATH = /^\/t\/([^/]+)/;

/** Slug named by a console path (`/t/{slug}/...`), else null. */
export function tenantSlugFromPath(pathname: string): string | null {
  const match = CONSOLE_PATH.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * The workspace this page belongs to: its subdomain, else the console path, else the platform
 * workspace. The SDK binds one client to one tenant (header + cookies), so every surface must
 * talk to the tenant the person actually signed in to.
 */
export function activeTenantSlug(
  location: { host: string; pathname: string },
  rootDomain: string,
  fallback: string,
): string {
  return tenantSlugFromHost(location.host, rootDomain) ?? tenantSlugFromPath(location.pathname) ?? fallback;
}

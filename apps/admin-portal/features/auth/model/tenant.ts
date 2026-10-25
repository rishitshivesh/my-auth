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

/** Labels that are infrastructure identifiers, not tenant slugs. */
const RESERVED_LABELS = new Set([
  "www", "api", "admin", "mail", "smtp", "ftp",
  "cdn", "static", "assets", "media", "auth",
  "status", "docs", "help", "support",
]);

export function isReservedHostLabel(label: string): boolean {
  return RESERVED_LABELS.has(label.toLowerCase());
}

/**
 * Extracts the tenant slug from a hostname (single source of truth for the tenant resolver and
 * the CORS check).
 *
 * With a platform domain (production): `acme.<domain>` -> "acme", `<domain>` -> "sentry",
 * reserved labels / nested subdomains / foreign hosts -> null.
 * Without one (local dev): the first label of a 3+ label host, never for localhost or IPv4.
 */
export function extractTenantSlugFromHost(hostname: string, platformDomain: string | null): string | null {
  const host = hostname.split(":")[0] as string;

  if (platformDomain) {
    if (host === platformDomain) return "sentry";
    const suffix = `.${platformDomain}`;
    if (host.endsWith(suffix)) {
      const prefix = host.slice(0, host.length - suffix.length);
      if (prefix && !prefix.includes(".") && !isReservedHostLabel(prefix)) return prefix;
    }
    return null;
  }

  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const first = parts[0] as string;
  return isReservedHostLabel(first) ? null : first;
}

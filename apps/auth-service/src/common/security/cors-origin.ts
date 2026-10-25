/**
 * Strict CORS origin validation shared by the per-tenant allow-list endpoint and the
 * cache that backs the CORS check. An origin is scheme + host + optional port, nothing else.
 */
export const MAX_TENANT_ALLOWED_ORIGINS = 50;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Returns the canonical origin (lower-case, default port dropped) or a reason string when invalid.
 * Rejected: wildcards, "null", paths/queries/fragments/credentials, non-http(s) schemes and
 * plain http for anything but localhost / loopback.
 */
export function checkOrigin(raw: string): { origin: string } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: "origin must not be empty" };
  if (value.includes("*")) return { error: "wildcards are not allowed" };
  if (value === "null") return { error: '"null" is not a valid origin' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "not a valid origin (expected e.g. https://app.example.com)" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "scheme must be https (or http for localhost)" };
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    return { error: "http is only allowed for localhost; use https" };
  }
  if (url.username || url.password) return { error: "credentials are not allowed in an origin" };
  if (url.pathname !== "/" || url.search || url.hash) {
    return { error: "origin must be scheme + host + port only (no path, query or fragment)" };
  }
  // value must already be in origin form: "https://a.com" or "https://a.com:8443", no trailing slash.
  if (value.endsWith("/")) return { error: "origin must not have a trailing slash" };
  return { origin: url.origin };
}

export interface NormalizedOrigins {
  origins: string[];
  errors: Array<{ value: string; message: string }>;
}

/** Validates, canonicalises and de-duplicates a list. Preserves input order. */
export function normalizeOrigins(list: readonly string[]): NormalizedOrigins {
  const origins: string[] = [];
  const errors: NormalizedOrigins["errors"] = [];
  for (const raw of list) {
    const checked = checkOrigin(raw);
    if ("error" in checked) errors.push({ value: raw, message: checked.error });
    else if (!origins.includes(checked.origin)) origins.push(checked.origin);
  }
  return { origins, errors };
}

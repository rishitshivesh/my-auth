export const MAX_ORIGINS = 50;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type OriginError = "empty" | "wildcard" | "null" | "invalid" | "scheme" | "http" | "credentials" | "path" | "duplicate" | "limit";

/** Mirrors the server's checkOrigin so errors show before saving; the server stays authoritative. */
export function checkOrigin(raw: string): { origin: string } | { error: OriginError } {
  const value = raw.trim();
  if (!value) return { error: "empty" };
  if (value.includes("*")) return { error: "wildcard" };
  if (value === "null") return { error: "null" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "scheme" };
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) return { error: "http" };
  if (url.username || url.password) return { error: "credentials" };
  if (url.pathname !== "/" || url.search || url.hash || value.endsWith("/")) return { error: "path" };
  return { origin: url.origin };
}

/** Validate an addition against the current list; returns the canonical origin or an error. */
export function addOrigin(current: readonly string[], raw: string): { origins: string[] } | { error: OriginError } {
  if (current.length >= MAX_ORIGINS) return { error: "limit" };
  const checked = checkOrigin(raw);
  if ("error" in checked) return checked;
  if (current.includes(checked.origin)) return { error: "duplicate" };
  return { origins: [...current, checked.origin] };
}

export function removeOrigin(current: readonly string[], origin: string): string[] {
  return current.filter((o) => o !== origin);
}

export function sameOrigins(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((o, i) => o === b[i]);
}

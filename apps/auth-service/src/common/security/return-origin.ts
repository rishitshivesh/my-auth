/**
 * Exact-origin allow-list check for post-login redirects.
 *
 * A string prefix match (`startsWith`) is NOT safe: "https://portal.test.evil.io"
 * and "https://portal.test@evil.io" both start with "https://portal.test".
 * Credentials in the URL and non-http(s) schemes are always refused.
 */
export function isAllowedReturnOrigin(raw: string, allowed: ReadonlySet<string>): boolean {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return false;
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return allowed.has(url.origin);
  } catch {
    return false;
  }
}

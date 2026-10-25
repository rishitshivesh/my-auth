/**
 * Builds and validates the `continue` value handed to the hosted login UI.
 *
 * The login UI redirects the browser to `continue` after authentication, so it
 * must never be attacker-controlled. We only ever emit a same-origin *relative*
 * `/oauth/authorize?...` URL built from parsed parameters (never from the raw
 * request URL), and expose `isSafeAuthorizeContinue` so the UI contract is
 * testable.
 */
export const AUTHORIZE_PATH = "/oauth/authorize";

const MAX_CONTINUE_LENGTH = 4096;
const PLACEHOLDER_ORIGIN = "http://continue.invalid";

export type AuthorizeContinueParams = Readonly<Record<string, string | number | undefined>>;

export function buildAuthorizeContinue(params: AuthorizeContinueParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `${AUTHORIZE_PATH}?${search.toString()}`;
}

export function isSafeAuthorizeContinue(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CONTINUE_LENGTH) {
    return false;
  }
  // Reject anything that is not a plain absolute-path reference.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value, PLACEHOLDER_ORIGIN);
    return parsed.origin === PLACEHOLDER_ORIGIN && parsed.pathname === AUTHORIZE_PATH;
  } catch {
    return false;
  }
}

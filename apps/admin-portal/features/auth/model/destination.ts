/**
 * Validated post-auth destinations. Only same-origin paths, tenant subdomains of the
 * portal root domain, or the auth-service OAuth authorize endpoint are followed.
 *
 * Two trust levels. `next` from the address bar is untrusted and only follows the allow-list
 * above. A `redirectUri` returned by the auth-service (verify, reset, magic link, poll) was
 * checked server-side against portal origins and the tenant's application redirect URIs when the
 * link was requested, so `resolveServerDestination` also accepts that absolute http(s) URL.
 */

export interface DestinationContext {
  /** Origin the portal is served from, e.g. https://acme.sentry.scrolloop.com */
  origin: string;
  /** Portal root domain, e.g. sentry.scrolloop.com */
  rootDomain?: string;
  /** Auth-service origin (for /oauth/authorize continuations). */
  apiOrigin?: string;
}

export interface Destination {
  href: string;
  /** External destinations need a full page navigation, not router.replace. */
  isExternal: boolean;
}

const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
const SAML_CONTINUE_PREFIX = "/saml/sso/continue/";
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isSafeRelative(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

function isAllowedApiPath(pathname: string): boolean {
  return pathname === OAUTH_AUTHORIZE_PATH || pathname.startsWith(SAML_CONTINUE_PREFIX);
}

function isPortalHost(host: string, rootDomain: string | undefined): boolean {
  if (!rootDomain) return false;
  return host === rootDomain || host.endsWith(`.${rootDomain}`);
}

export function resolveDestination(
  raw: string | null | undefined,
  ctx: DestinationContext,
): Destination | null {
  if (!raw || CONTROL_CHARS.test(raw)) return null;
  if (isSafeRelative(raw)) return { href: raw, isExternal: false };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (url.origin === ctx.origin) {
    return { href: `${url.pathname}${url.search}${url.hash}`, isExternal: false };
  }
  // The API origin is only ever a target for protocol continuations, even under the root domain.
  if (ctx.apiOrigin && url.origin === ctx.apiOrigin) {
    return isAllowedApiPath(url.pathname) ? { href: url.toString(), isExternal: true } : null;
  }
  if (isPortalHost(url.hostname, ctx.rootDomain)) return { href: url.toString(), isExternal: true };
  return null;
}

const MAX_SERVER_DESTINATION_LENGTH = 2048;

/** Destination echoed back by the auth-service after it validated it against the tenant's applications. */
export function resolveServerDestination(
  raw: string | null | undefined,
  ctx: DestinationContext,
): Destination | null {
  if (!raw || raw.length > MAX_SERVER_DESTINATION_LENGTH || CONTROL_CHARS.test(raw)) return null;
  const strict = resolveDestination(raw, ctx);
  if (strict) return strict;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? { href: url.toString(), isExternal: true } : null;
  } catch {
    return null;
  }
}

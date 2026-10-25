/** Protocol endpoints derived from the API base URL; read-only operational output. */

export type EndpointId =
  | "issuer" | "discovery" | "jwks" | "authorize" | "token" | "userinfo" | "revoke" | "introspect";

export interface EndpointEntry {
  id: EndpointId;
  url: string;
}

const trimSlash = (value: string): string => value.replace(/\/+$/, "");

export function oidcEndpoints(baseUrl: string): EndpointEntry[] {
  const base = trimSlash(baseUrl);
  return [
    { id: "issuer", url: base },
    { id: "discovery", url: `${base}/.well-known/openid-configuration` },
    { id: "jwks", url: `${base}/.well-known/jwks.json` },
    { id: "authorize", url: `${base}/oauth/authorize` },
    { id: "token", url: `${base}/oauth/token` },
    { id: "userinfo", url: `${base}/oauth/userinfo` },
    { id: "revoke", url: `${base}/oauth/revoke` },
    { id: "introspect", url: `${base}/oauth/introspect` },
  ];
}

export function samlMetadataUrl(baseUrl: string, tenantSlug: string): string {
  return `${trimSlash(baseUrl)}/saml/metadata/${encodeURIComponent(tenantSlug)}`;
}

export function scimBaseUrl(baseUrl: string): string {
  return `${trimSlash(baseUrl)}/scim/v2`;
}

export function socialCallbackUrl(baseUrl: string, provider: string): string {
  return `${trimSlash(baseUrl)}/auth/social/${encodeURIComponent(provider)}/callback`;
}

/**
 * Typed route builders. The only place route strings live; pages, nav and
 * redirects import from here so a path change is a one-file edit.
 * Surfaces are kept separate: hosted identity (/u), personal account,
 * tenant console (/t/[slug]) and platform console.
 */

const seg = (value: string): string => encodeURIComponent(value);

function withQuery(path: string, query?: Record<string, string | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const authRoutes = {
  login: (query?: { next?: string; reauth?: string; email?: string }) => withQuery("/u/login", query),
  signup: () => "/u/signup",
  verifyEmail: (query?: { token?: string; email?: string }) => withQuery("/u/verify-email", query),
  resetPassword: (query?: { token?: string }) => withQuery("/u/reset-password", query),
  magicLink: (query?: { token?: string }) => withQuery("/u/magic-link", query),
  mfa: (query?: { next?: string }) => withQuery("/u/mfa", query),
  mfaEnroll: () => "/mfa/enroll",
  invite: (token: string) => `/invite/${seg(token)}`,
  callback: () => "/u/auth/callback",
  error: () => "/error",
} as const;

export const onboardingRoutes = {
  root: () => "/onboarding",
  country: () => "/onboarding/country",
  createTenant: () => "/onboarding/create-tenant",
} as const;

export const accountRoutes = {
  overview: () => "/dashboard",
  profile: () => "/dashboard/profile",
  security: () => "/dashboard/security",
  settings: () => "/dashboard/settings",
  applications: () => "/dashboard/applications",
  activity: () => "/dashboard/activity",
} as const;

/** Routes inside one workspace: `/t/[slug]/...`. */
export function tenantRoutes(slug: string) {
  const base = `/t/${seg(slug)}`;
  return {
    root: () => base,
    dashboard: () => `${base}/dashboard`,
    users: () => `${base}/users`,
    user: (id: string) => `${base}/users/${seg(id)}`,
    roles: () => `${base}/roles`,
    groups: () => `${base}/groups`,
    policies: () => `${base}/policies`,
    simulator: () => `${base}/policies/simulate`,
    applications: () => `${base}/applications`,
    clients: () => `${base}/clients`,
    connections: () => `${base}/connections`,
    saml: () => `${base}/connections/saml`,
    scim: () => `${base}/connections/scim`,
    ldap: () => `${base}/connections/ldap`,
    webhooks: () => `${base}/webhooks`,
    audit: () => `${base}/audit`,
    branding: () => `${base}/branding`,
    domains: () => `${base}/domains`,
    settings: () => `${base}/settings`,
    security: () => `${base}/security`,
    devices: () => `${base}/security/devices`,
  } as const;
}

export const platformRoutes = {
  setup: () => "/setup",
  dashboard: () => "/dashboard",
  tenants: () => "/tenants",
  newTenant: () => "/tenants/new",
  tenant: (tenantId: string) => `/tenants/${seg(tenantId)}`,
  people: () => "/users",
  audit: () => "/audit-logs",
  settings: () => "/settings",
} as const;

export type TenantRoutes = ReturnType<typeof tenantRoutes>;

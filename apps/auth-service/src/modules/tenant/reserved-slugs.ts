/**
 * Tenant slugs that map to platform routes or subdomains and must never be
 * claimed by a tenant. Shared by self-service registration and admin creation.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "auth", "www", "mail", "smtp", "sentry",
  "support", "help", "status", "billing", "dashboard",
  "login", "logout", "signup", "register", "setup", "onboarding",
  "app", "console", "manage", "portal",
  "superadmin", "static", "assets", "cdn", "docs", "root", "oauth",
  "account", "accounts", "ftp", "imap", "pop", "ns1", "ns2", "internal",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

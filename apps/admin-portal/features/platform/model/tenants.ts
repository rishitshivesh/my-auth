export const TENANTS_PAGE_SIZE = 20;
export const PLANS = ["free", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];
export const STATUS_FILTERS = ["active", "suspended"] as const;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/;
export const NAME_MAX = 255;

export interface TenantsQuery {
  search: string;
  status: string;
  plan: string;
  page: number;
}

export function tenantsQueryString(q: TenantsQuery): string {
  const params = new URLSearchParams();
  if (q.search.trim()) params.set("search", q.search.trim());
  if (q.status) params.set("status", q.status);
  if (q.plan) params.set("plan", q.plan);
  params.set("page", String(q.page));
  params.set("limit", String(TENANTS_PAGE_SIZE));
  return params.toString();
}

export function hasTenantFilters(q: TenantsQuery): boolean {
  return Boolean(q.search.trim() || q.status || q.plan);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TENANTS_PAGE_SIZE));
}

/** Lowercase, hyphenate, trim hyphens: the suggestion offered while typing a name. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export type NewTenantErrors = Partial<Record<"name" | "slug", "required" | "tooLong" | "slug">>;

export interface NewTenantDraft {
  name: string;
  slug: string;
  plan: Plan;
  useCurrentUserAsAdmin: boolean;
}

export function validateNewTenant(draft: NewTenantDraft): NewTenantErrors {
  const errors: NewTenantErrors = {};
  if (!draft.name.trim()) errors.name = "required";
  else if (draft.name.length > NAME_MAX) errors.name = "tooLong";
  if (!draft.slug) errors.slug = "required";
  else if (!SLUG_PATTERN.test(draft.slug)) errors.slug = "slug";
  return errors;
}

/** Phrase typed to confirm a permanent delete: the slug itself, so the right tenant is deleted. */
export function deleteConfirmPhrase(tenant: { slug: string }): string {
  return tenant.slug;
}

export function nextStatus(status: string): "active" | "suspended" {
  return status === "active" ? "suspended" : "active";
}

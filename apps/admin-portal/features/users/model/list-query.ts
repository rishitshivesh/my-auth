import { toQueryString } from "@/lib/query-string";

export const USERS_PAGE_SIZE = 20;

/**
 * Filters the API can express today. TODO(gap:T02-boolean-filter): ListUsersQueryDto
 * coerces booleans with `@Type(() => Boolean)`, so "false" becomes true and
 * inactive/unverified cannot be requested; those filters are not offered.
 */
export type PeopleStatusFilter = "all" | "active" | "verified";

export interface PeopleFilters {
  search: string;
  status: PeopleStatusFilter;
  page: number;
}

export const DEFAULT_FILTERS: PeopleFilters = { search: "", status: "all", page: 1 };

export function isFiltered(filters: PeopleFilters): boolean {
  return filters.search.trim() !== "" || filters.status !== "all";
}

export function toUsersQuery(filters: PeopleFilters, limit: number = USERS_PAGE_SIZE): string {
  return toQueryString({
    page: Math.max(1, filters.page),
    limit,
    search: filters.search.trim() || undefined,
    isActive: filters.status === "active" ? true : undefined,
    emailVerified: filters.status === "verified" ? true : undefined,
  });
}

/** Search and filter changes always return to the first page. */
export function withFilters(current: PeopleFilters, change: Partial<Omit<PeopleFilters, "page">>): PeopleFilters {
  return { ...current, ...change, page: 1 };
}

/** Export honours the same search/status filters as the list. */
export function exportQuery(filters: PeopleFilters): string {
  return toQueryString({
    search: filters.search.trim() || undefined,
    isActive: filters.status === "active" ? true : undefined,
    emailVerified: filters.status === "verified" ? true : undefined,
  });
}

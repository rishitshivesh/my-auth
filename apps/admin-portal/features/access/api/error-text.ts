import { describeError, fieldErrorMap, SentryApiError } from "@/lib/api-error";
import type { ResourceStatus } from "@repo/ui";

/** Human text for a thrown value; used by views so components stay free of SDK imports. */
export function errorText(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined;
  return describeError(error).message;
}

export function errorFields(error: unknown): Record<string, string> {
  return fieldErrorMap(error);
}

export function isForbidden(error: unknown): boolean {
  return error instanceof SentryApiError && (error.code === "ACCESS_FORBIDDEN" || error.status === 403);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof SentryApiError && (error.code === "RESOURCE_NOT_FOUND" || error.status === 404);
}

export function isRecentAuthRequired(error: unknown): boolean {
  return error instanceof SentryApiError && error.code === "ACCESS_RECENT_AUTH_REQUIRED";
}

export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/** Maps a TanStack query to the state ResourceTable / StateView understand. */
export function queryStatus(query: QueryLike): ResourceStatus {
  if (query.isPending) return "loading";
  if (!query.isError) return "ready";
  return isForbidden(query.error) ? "denied" : "error";
}

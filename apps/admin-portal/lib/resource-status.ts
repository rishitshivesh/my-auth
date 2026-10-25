import { SentryApiError } from "@scrolloop/sdk";
import type { ResourceStatus } from "@repo/ui";
import { describeError } from "./api-error";

const FORBIDDEN = 403;
const SERVER_ERROR_FLOOR = 500;

export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/** Map a query to the table/state vocabulary: 403 is denied, 5xx or no response is unavailable. */
export function statusFromQuery(q: QueryLike): ResourceStatus {
  if (q.isPending) return "loading";
  if (!q.isError) return "ready";
  if (q.error instanceof SentryApiError) {
    if (q.error.status === FORBIDDEN) return "denied";
    if (q.error.status >= SERVER_ERROR_FLOOR) return "unavailable";
    return "error";
  }
  return "unavailable";
}

export function isRecentAuthError(error: unknown): boolean {
  return error instanceof SentryApiError && error.code === "ACCESS_RECENT_AUTH_REQUIRED";
}

export function isConflictError(error: unknown): boolean {
  return error instanceof SentryApiError && error.code === "RESOURCE_CONFLICT";
}

/** Server message for inline display; undefined when there is no error. */
export function errorText(error: unknown): string | undefined {
  return error ? describeError(error).message : undefined;
}

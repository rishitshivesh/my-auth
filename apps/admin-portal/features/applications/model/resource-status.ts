import type { ResourceStatus } from "@repo/ui";

const HTTP_FORBIDDEN = 403;

export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const { status } = error as { status: unknown };
  return typeof status === "number" ? status : undefined;
}

/** Map a query result to the table/state status; 403 is "denied", never a generic error. */
export function resourceStatus(query: QueryLike): ResourceStatus {
  if (query.isPending) return "loading";
  if (query.isError) return httpStatus(query.error) === HTTP_FORBIDDEN ? "denied" : "error";
  return "ready";
}

export function isNotFound(error: unknown): boolean {
  return httpStatus(error) === 404;
}

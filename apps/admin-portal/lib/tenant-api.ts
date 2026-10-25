import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { apiUrl } from "@/lib/queries/shared";

export type TenantApiMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Typed call into the tenant-scoped API. Errors are thrown as SentryApiError and
 * never toasted here: feature views render them inline next to the action.
 */
export function tenantRequest<T>(path: string, method: TenantApiMethod = "GET", body?: unknown): Promise<T> {
  const call = withErrorHandler<[], T>(
    async () => authClient.request({ url: apiUrl(path), method, body }),
    { showErrorToast: false },
  );
  return call();
}

export { toQueryString } from "@/lib/query-string";

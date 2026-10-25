import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Typed call through the SDK transport. The `{ data }` envelope is unwrapped and
 * failures are thrown as SentryApiError. Errors are surfaced inline by views, so
 * toasts are off.
 */
export function apiRequest<T>(method: ApiMethod, path: string, options: ApiRequestOptions = {}): Promise<T> {
  return withErrorHandler<[], T>(
    async () =>
      authClient.request({
        url: `${authClient.getBaseURL()}${path}`,
        method,
        body: options.body,
        headers: options.headers,
      }),
    { showErrorToast: false },
  )();
}

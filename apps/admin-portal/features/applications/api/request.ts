import { authClient } from "@/lib/auth-client";
import { apiUrl } from "@/lib/queries/shared";
import { withErrorHandler } from "@/lib/with-error-handler";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface CallOptions {
  /** Toast failures. Off for queries (the view renders the state) and for dialogs that show errors inline. */
  toast?: boolean;
}

/** Typed call through the SDK transport; unwraps the `{ data }` envelope and throws SentryApiError. */
export function apiCall<Result, Body = undefined>(method: Method, path: string, options: CallOptions = {}) {
  return withErrorHandler<[Body?], Result>(
    async (body?: Body) =>
      authClient.request({
        url: apiUrl(path),
        method,
        ...(body === undefined ? {} : { body }),
      }),
    { showErrorToast: options.toast ?? false },
  );
}

export function apiBaseUrl(): string {
  return authClient.getBaseURL();
}

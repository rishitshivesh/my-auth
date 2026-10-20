import { toast } from "sonner";
import { SentryApiError, describeError } from "./api-error";
import { SESSION_ENDED_CODES } from "./error-messages";

export interface ErrorHandlerConfig {
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
}

interface HasMessage {
  message?: string;
}

interface TransportResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  data?: unknown;
}

const LOGIN_PATH = "/u/login";

function redirectToLogin() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith(LOGIN_PATH)) {
    window.location.href = LOGIN_PATH;
  }
}

/** Show a toast for an error: friendly message plus a small support reference. */
export function toastApiError(error: unknown, override?: string) {
  const view = describeError(error);
  const options: { description?: string; action?: { label: string; onClick: () => void } } = {};
  if (view.reference) options.description = view.reference;
  if (error instanceof SentryApiError && error.code === "ACCESS_RECENT_AUTH_REQUIRED") {
    options.action = { label: "Sign in again", onClick: redirectToLogin };
  }
  toast.error(override ?? view.message, options);
}

/**
 * Higher-Order Function to wrap API requests with error handling and toasts.
 * Automatically handles backend responses wrapped in { data: T } and returns
 * the unwrapped data payload. Failures are thrown as SentryApiError.
 */
export function withErrorHandler<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<unknown>,
  config: ErrorHandlerConfig = {}
) {
  const {
    showErrorToast = true,
    showSuccessToast = false,
    successMessage,
    errorMessage,
  } = config;

  return async (...args: Args): Promise<R> => {
    try {
      const response = await fn(...args);

      // Handle authClient.request style responses (TransportResponse)
      if (response && typeof response === "object" && "ok" in response) {
        const resObj = response as TransportResponseLike;
        if (!resObj.ok) {
          throw SentryApiError.fromResponse(resObj);
        }

        // Extract { data: T } or { data: { data: T } }
        const responseData = resObj.data;
        const result =
          responseData && typeof responseData === "object" && "data" in responseData
            ? (responseData as Record<string, unknown>).data
            : responseData;

        if (showSuccessToast) {
          const succMsg = successMessage || (responseData as HasMessage | undefined)?.message || "Operation successful";
          toast.success(succMsg);
        }

        return result as R;
      }

      // If it's a direct response object that is not a TransportResponse
      const result =
        response && typeof response === "object" && "data" in response
          ? (response as Record<string, unknown>).data
          : response;

      if (showSuccessToast && successMessage) {
        toast.success(successMessage);
      }

      return result as R;
    } catch (error: unknown) {
      if (error instanceof SentryApiError && SESSION_ENDED_CODES.has(error.code)) {
        redirectToLogin();
        throw error;
      }

      const legacyExpired =
        !(error instanceof SentryApiError) &&
        error instanceof Error &&
        (error.message === "SESSION_EXPIRED" ||
          error.message.toLowerCase().includes("session expired") ||
          error.message.toLowerCase().includes("not authenticated"));
      if (legacyExpired) {
        redirectToLogin();
      } else if (showErrorToast) {
        toastApiError(error, errorMessage);
      }
      throw error;
    }
  };
}

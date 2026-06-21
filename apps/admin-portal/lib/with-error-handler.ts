import { toast } from "sonner";

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
  data?: unknown;
}

/**
 * Higher-Order Function to wrap API requests with error handling and toasts.
 * Automatically handles backend responses wrapped in { data: T } and returns
 * the unwrapped data payload.
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

  const handleSessionExpired = () => {
    if (typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/u/login")) {
        window.location.href = "/u/login";
      }
    }
  };

  return async (...args: Args): Promise<R> => {
    try {
      const response = await fn(...args);

      // Handle authClient.request style responses (TransportResponse)
      if (response && typeof response === "object" && "ok" in response) {
        const resObj = response as TransportResponseLike;
        if (!resObj.ok) {
          if (resObj.status === 401) {
            handleSessionExpired();
            throw new Error("Session expired");
          }

          const resData = resObj.data as Record<string, unknown> | undefined;
          const msg =
            resData?.message ??
            resData?.error ??
            resObj.statusText ??
            "An unexpected error occurred";
          const finalErrorMsg = errorMessage ?? (Array.isArray(msg) ? msg.join("; ") : String(msg));

          if (showErrorToast) {
            toast.error(finalErrorMsg);
          }
          throw new Error(finalErrorMsg);
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
      const err = error as Error & { status?: number };
      const msg = err?.message ?? "An unexpected error occurred";
      const finalErrorMsg = errorMessage ?? msg;

      if (
        msg === "SESSION_EXPIRED" ||
        msg.toLowerCase().includes("session expired") ||
        msg.toLowerCase().includes("not authenticated") ||
        err?.status === 401
      ) {
        handleSessionExpired();
      } else if (showErrorToast) {
        toast.error(finalErrorMsg);
      }
      throw error;
    }
  };
}

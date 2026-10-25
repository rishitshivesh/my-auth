import { useMutation, useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { apiUrl } from "./shared";

// ─── Registration ────────────────────────────────────────────

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export function useRegister() {
  return useMutation<{ message: string }, Error, RegisterData>({
    mutationFn: withErrorHandler<[RegisterData], { message: string }>(
      async (body) => authClient.request({
        url: apiUrl("/auth/register"),
        method: "POST",
        body: JSON.stringify(body),
      }),
      { showErrorToast: true }
    ),
  });
}

export function useVerifyEmail() {
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (token) => authClient.request({
        url: apiUrl("/auth/verify-email"),
        method: "POST",
        body: JSON.stringify({ token }),
      }),
      { showErrorToast: false }
    ),
  });
}

export function useResendVerification() {
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (email) => authClient.request({
        url: apiUrl("/auth/resend-verification"),
        method: "POST",
        body: { email },
      }),
      { successMessage: "Verification email resent successfully", showSuccessToast: true }
    ),
  });
}

// ─── Invitations ─────────────────────────────────────────────

export interface InviteData {
  tenantName: string;
  tenantSlug: string;
  email: string;
}

export function useValidateInvite(token: string) {
  return useQuery<InviteData>({
    queryKey: ["invite", "validate", token],
    queryFn: withErrorHandler<[], InviteData>(
      async () => authClient.request({
        url: apiUrl(`/auth/invite/validate/${token}`),
        method: "GET",
      }),
      { showErrorToast: false, errorMessage: "Invalid or expired invitation" }
    ),
    enabled: !!token,
  });
}

export function useAcceptInvite() {
  return useMutation<void, Error, { token: string; name: string; password?: string }>({
    mutationFn: withErrorHandler<[{ token: string; name: string; password?: string }], void>(
      async (body) => authClient.request({
        url: apiUrl("/auth/invite/accept"),
        method: "POST",
        body,
      }),
      { showErrorToast: true }
    ),
  });
}

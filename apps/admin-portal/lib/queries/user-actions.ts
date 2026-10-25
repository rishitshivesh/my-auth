import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { apiUrl } from "./shared";

// ── Admin User Actions ────────────────────────────────────────

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, { email: string; roleIds?: string[] }>({
    mutationFn: withErrorHandler<[{ email: string; roleIds?: string[] }], void>(
      async (body) => authClient.request({ url: apiUrl("/users/invite"), method: "POST", body }),
      { successMessage: "Invitation sent", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "users"] }),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: string; reason: string }>({
    mutationFn: withErrorHandler<[{ userId: string; reason: string }], void>(
      async ({ userId, reason }) => authClient.request({
        url: apiUrl(`/admin/users/${userId}/suspend`),
        method: "POST",
        body: { reason },
      }),
      { successMessage: "User suspended", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "users"] }),
  });
}

export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (userId) => authClient.request({
        url: apiUrl(`/admin/users/${userId}/restore`),
        method: "POST",
      }),
      { successMessage: "User restored", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "users"] }),
  });
}

export function useDeleteTenantUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (userId) => authClient.request({
        url: apiUrl(`/admin/users/${userId}`),
        method: "DELETE",
      }),
      { successMessage: "User deleted", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "users"] }),
  });
}

export function useForcePasswordReset() {
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (userId) => authClient.request({
        url: apiUrl(`/admin/users/${userId}/force-password-reset`),
        method: "POST",
      }),
      { successMessage: "Password reset email sent", showSuccessToast: true, showErrorToast: true }
    ),
  });
}

export function useSendEmailToUser() {
  return useMutation<void, Error, { userId: string; subject: string; body: string }>({
    mutationFn: withErrorHandler<[{ userId: string; subject: string; body: string }], void>(
      async ({ userId, subject, body: emailBody }) => authClient.request({
        url: apiUrl(`/admin/users/${userId}/send-email`),
        method: "POST",
        body: { subject, body: emailBody },
      }),
      { successMessage: "Email sent", showSuccessToast: true, showErrorToast: true }
    ),
  });
}

export function useRevokeAllUserSessions() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (userId) => authClient.request({
        url: apiUrl(`/admin/users/${userId}/sessions/revoke-all`),
        method: "POST",
      }),
      { successMessage: "All sessions revoked", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, userId) => qc.invalidateQueries({ queryKey: ["tenant", "users", userId] }),
  });
}

export function useResetUserMfa() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (userId) => authClient.request({
        url: apiUrl(`/mfa/reset-user/${userId}`),
        method: "POST",
      }),
      { successMessage: "MFA reset for user", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, userId) => qc.invalidateQueries({ queryKey: ["tenant", "users", userId] }),
  });
}

export function useExportUsersCsv(filters?: { search?: string; status?: string }) {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const qs = new URLSearchParams();
      if (filters?.search) qs.set("search", filters.search);
      if (filters?.status && filters.status !== "all") qs.set("status", filters.status);
      const url = `${authClient.getBaseURL()}/admin/users/export?${qs.toString()}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  });
}

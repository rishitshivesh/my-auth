import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { ActiveSessionDto } from "@/lib/types";
import { apiUrl } from "./shared";

// ── Session Management ────────────────────────────────────────

export function useActiveSessions() {
  return useQuery<ActiveSessionDto[]>({
    queryKey: ["sessions", "active"],
    queryFn: withErrorHandler<[], ActiveSessionDto[]>(
      async () => authClient.request({
        url: apiUrl("/sessions/active"),
        method: "GET",
      })
    ),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (sessionId: string) => authClient.request({
        url: apiUrl(`/sessions/${sessionId}`),
        method: "DELETE",
      }),
      { successMessage: "Session revoked successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "active"] }),
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: withErrorHandler<[], void>(
      async () => authClient.request({
        url: apiUrl("/sessions/all/other"),
        method: "DELETE",
      }),
      { successMessage: "All other sessions revoked successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "active"] }),
  });
}

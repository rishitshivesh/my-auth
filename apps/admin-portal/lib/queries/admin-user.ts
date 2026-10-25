import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { apiUrl } from "./shared";

// ── Admin: Per-User Sessions & Audit ────────────────────────────

export interface AdminUserSession {
  id: string;
  deviceInfo: { browser?: string; os?: string; device?: string; type?: string };
  location?: { city?: string; country?: string; timezone?: string };
  ipAddress?: string;
  lastActivityAt: Date;
  createdAt: Date;
  current: boolean;
}

export interface AdminSecurityEvent {
  id: string;
  eventType: string;
  severity: string;
  ipAddress?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function useAdminUserSessions(userId: string, options?: { enabled?: boolean }) {
  return useQuery<AdminUserSession[]>({
    queryKey: ["admin", "users", userId, "sessions"],
    queryFn: withErrorHandler<[], AdminUserSession[]>(
      async () => authClient.request({
        url: apiUrl(`/users/${userId}/sessions`),
        method: "GET",
      })
    ),
    select: (raw: unknown) => {
      const arr = Array.isArray(raw) ? raw : [];
      return (arr as Array<Record<string, unknown>>).map((s) => ({
        id: s['id'] as string,
        deviceInfo: (s['deviceInfo'] ?? {}) as AdminUserSession['deviceInfo'],
        location: s['location'] as AdminUserSession['location'],
        ipAddress: s['ipAddress'] as string | undefined,
        lastActivityAt: new Date(((s['lastActivity'] ?? s['lastActivityAt']) as string)),
        createdAt: new Date(s['createdAt'] as string),
        current: Boolean(s['isCurrent'] ?? s['current']),
      }));
    },
    enabled: !!userId && (options?.enabled ?? true),
  });
}

export function useAdminRevokeUserSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: string; sessionId: string }>({
    mutationFn: withErrorHandler<[{ userId: string; sessionId: string }], void>(
      async ({ userId, sessionId }) => authClient.request({
        url: apiUrl(`/users/${userId}/sessions/${sessionId}`),
        method: "DELETE",
      }),
      { successMessage: "Session revoked", showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ["admin", "users", userId, "sessions"] }),
  });
}

export function useAdminUserAudit(userId: string, options?: { limit?: number; enabled?: boolean }) {
  return useQuery<AdminSecurityEvent[]>({
    queryKey: ["admin", "users", userId, "security-events"],
    queryFn: withErrorHandler<[], AdminSecurityEvent[]>(
      async () => authClient.request({
        url: apiUrl(`/users/${userId}/security-events?limit=${options?.limit ?? 50}`),
        method: "GET",
      })
    ),
    enabled: !!userId && (options?.enabled ?? true),
  });
}

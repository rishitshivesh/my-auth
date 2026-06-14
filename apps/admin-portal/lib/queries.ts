import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/app/layout";
import type { 
  DashboardData, 
  MfaStatus, 
  TotpSetupData, 
  TenantSettings, 
  PasskeyCredential, 
  SocialConnection, 
  TenantMetrics, 
  ActivityEvent, 
  TrendPoint, 
  AuthBreakdown, 
  BrandingConfig, 
  ActiveSessionDto,
  DashboardUser
} from "./types";


function apiUrl(path: string): string {
  return `${authClient.getBaseURL()}${path}`;
}

// ─── Dashboard ───────────────────────────────────────────────

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/dashboard"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.data.data;
    },
  });
}

// ─── MFA ─────────────────────────────────────────────────────

export function useMfaStatus() {
  return useQuery<MfaStatus>({
    queryKey: ["mfa", "status"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/status"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch MFA status");
      return res.data.data;
    },
  });
}

export function useSetupTotp() {
  return useMutation<TotpSetupData>({
    mutationFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/setup/totp"), method: "POST" });
      if (!res.ok) throw new Error("Failed to start TOTP setup");
      return res.data.data;
    },
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (token: string) => {
      const res = await authClient.request({
        url: apiUrl("/mfa/verify/totp"),
        method: "POST",
        body: { token },
      });
      if (!res.ok) throw new Error("Invalid code. Please try again.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableTotp() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/totp"), method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disable TOTP");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Tenant Settings ──────────────────────────────────────────

export function useTenantSettings() {
  return useQuery<TenantSettings>({
    queryKey: ["tenant", "settings"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/dashboard/tenant-settings"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch tenant settings");
      return res.data.data;
    },
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation<void, Error, { featureFlags: Record<string, boolean> }>({
    mutationFn: async (body) => {
      const res = await authClient.request({
        url: apiUrl("/dashboard/tenant-settings"),
        method: "PATCH",
        body,
      });
      if (!res.ok) throw new Error("Failed to update settings");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "settings"] }),
  });
}

export function useUpdateSocialProvider() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { provider: string; enabled: boolean; clientId?: string; clientSecret?: string }
  >({
    mutationFn: async ({ provider, ...body }) => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-settings/social/${provider}`),
        method: "PATCH",
        body,
      });
      if (!res.ok) throw new Error("Failed to update social provider");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "settings"] }),
  });
}

// ── Passkey Management ─────────────────────────────────────────────

export function useListPasskeys() {
  return useQuery<PasskeyCredential[]>({
    queryKey: ["passkeys"],
    queryFn: () => authClient.listPasskeys(),
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (credentialId: string) => authClient.deletePasskey(credentialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  });
}

// ── Social Connections ─────────────────────────────────────────────

export function useSocialConnections() {
  return useQuery<SocialConnection[]>({
    queryKey: ["social-connections"],
    queryFn: () => authClient.getSocialConnections(),
  });
}

export function useUnlinkSocialAccount() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (provider: string) => authClient.unlinkSocialAccount(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-connections"] }),
  });
}

// ─── Tenant Admin Dashboard ──────────────────────────────────────

export function useTenantUsers(params: {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));

  return useQuery<{
    users: DashboardUser[];
    nextCursor?: string;
    total: number;
  }>({
    queryKey: ["tenant", "users", params],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-users?${qs.toString()}`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch tenant users");
      return res.data.data;
    },
  });
}

export function useTenantUser(userId: string) {
  return useQuery<DashboardUser>({
    queryKey: ["tenant", "users", userId],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-users/${userId}`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch user details");
      return res.data.data;
    },
    enabled: !!userId,
  });
}

export function useTenantRoles() {
  return useQuery<any[]>({
    queryKey: ["tenant", "roles"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-roles`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.data.data;
    },
  });
}

export function useTenantClients() {
  return useQuery<any[]>({
    queryKey: ["tenant", "clients"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-clients`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.data.data;
    },
  });
}

// ─── Invitations ─────────────────────────────────────────────

export function useValidateInvite(token: string) {
  return useQuery({
    queryKey: ["invite", "validate", token],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/auth/invite/validate/${token}`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Invalid or expired invitation");
      return res.data.data;
    },
    enabled: !!token,
  });
}

export function useAcceptInvite() {
  return useMutation<void, Error, { token: string; name: string; password?: string }>({
    mutationFn: async (body) => {
      const res = await authClient.request({
        url: apiUrl("/auth/invite/accept"),
        method: "POST",
        body,
      });
      if (!res.ok) throw new Error(res.data?.message || "Failed to accept invitation");
    },
  });
}

export function useTenantMetrics() {





  return useQuery<TenantMetrics>({
    queryKey: ["tenant", "metrics"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl("/dashboard/tenant-metrics"),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch tenant metrics");
      return res.data.data;
    },
  });
}

export function useTenantActivity(limit = 20) {
  return useQuery<ActivityEvent[]>({
    queryKey: ["tenant", "activity", limit],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-activity?limit=${limit}`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch tenant activity");
      return res.data.data;
    },
  });
}

export function useApiCallTrend(days: 7 | 14 | 30 = 7) {
  return useQuery<TrendPoint[]>({
    queryKey: ["tenant", "api-call-trend", days],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/api-call-trend?days=${days}`),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch API call trend");
      return res.data.data;
    },
  });
}

export function useAuthBreakdown() {
  return useQuery<AuthBreakdown>({
    queryKey: ["tenant", "auth-breakdown"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl("/dashboard/auth-breakdown"),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch auth breakdown");
      return res.data.data;
    },
  });
}

// ── Session Management ────────────────────────────────────────

export function useActiveSessions() {
  return useQuery<ActiveSessionDto[]>({
    queryKey: ["sessions", "active"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl("/sessions/active"),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch active sessions");
      return res.data.data;
    },
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (sessionId: string) => {
      const res = await authClient.request({
        url: apiUrl(`/sessions/${sessionId}`),
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke session");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "active"] }),
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await authClient.request({
        url: apiUrl("/sessions/all/other"),
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke all other sessions");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "active"] }),
  });
}

// ── Tenant Branding ──────────────────────────────────────────

export function useBranding() {
  return useQuery<BrandingConfig>({
    queryKey: ["tenant", "branding"],
    queryFn: async () => {
      const res = await authClient.request({
        url: apiUrl("/tenants/current/branding"),
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch branding");
      return res.data.data;
    },
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation<BrandingConfig, Error, Partial<BrandingConfig>>({
    mutationFn: async (body) => {
      const res = await authClient.request({
        url: apiUrl("/tenants/current/branding"),
        method: "PUT",
        body,
      });
      if (!res.ok) {
        const msg =
          res.data?.message ??
          res.data?.error ??
          "Failed to save branding";
        throw new Error(Array.isArray(msg) ? msg.join("; ") : msg);
      }
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "branding"] }),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation<{ logoUrl: string }, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(
        `${authClient.getBaseURL()}/tenants/current/branding/logo`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? "Logo upload failed");
      }
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "branding"] }),
  });
}

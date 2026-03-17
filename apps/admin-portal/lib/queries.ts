import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/app/layout";
import type { DashboardData, MfaStatus, TotpSetupData, TenantSettings, PasskeyCredential, SocialConnection, TenantMetrics, ActivityEvent, TrendPoint, AuthBreakdown } from "./types";

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

// ── Tenant Admin Dashboard ──────────────────────────────────────

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

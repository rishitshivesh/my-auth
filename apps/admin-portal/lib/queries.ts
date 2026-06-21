import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "./with-error-handler";
import type {
  DashboardData,
  DashboardUser,
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
  UserListResponse,
  Role,
  Client,
  WebhookEndpoint,
  WebhookDelivery,
  SamlServiceProvider,
  ScimToken,
  LdapConnection,
} from "./types";

function apiUrl(path: string): string {
  return `${authClient.getBaseURL()}${path}`;
}

// ─── Dashboard ───────────────────────────────────────────────

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: withErrorHandler<[], DashboardData>(
      async () => authClient.request({ url: apiUrl("/dashboard"), method: "GET" })
    ),
  });
}

// ─── MFA ─────────────────────────────────────────────────────

export function useMfaStatus() {
  return useQuery<MfaStatus>({
    queryKey: ["mfa", "status"],
    queryFn: withErrorHandler<[], MfaStatus>(
      async () => authClient.request({ url: apiUrl("/mfa/status"), method: "GET" })
    ),
  });
}

export function useSetupTotp() {
  return useMutation<TotpSetupData>({
    mutationFn: withErrorHandler<[], TotpSetupData>(
      async () => authClient.request({ url: apiUrl("/mfa/setup/totp"), method: "POST" })
    ),
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (token: string) => authClient.request({
        url: apiUrl("/mfa/verify/totp"),
        method: "POST",
        body: { token },
      }),
      { errorMessage: "Invalid code. Please try again.", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableTotp() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: withErrorHandler<[], void>(
      async () => authClient.request({ url: apiUrl("/mfa/totp"), method: "DELETE" }),
      { errorMessage: "Failed to disable TOTP", showErrorToast: true }
    ),
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
    queryFn: withErrorHandler<[], TenantSettings>(
      async () => authClient.request({ url: apiUrl("/dashboard/tenant-settings"), method: "GET" })
    ),
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation<void, Error, { featureFlags: Record<string, boolean> }>({
    mutationFn: withErrorHandler<[{ featureFlags: Record<string, boolean> }], void>(
      async (body) => authClient.request({
        url: apiUrl("/dashboard/tenant-settings"),
        method: "PATCH",
        body,
      }),
      { errorMessage: "Failed to update settings", showErrorToast: true }
    ),
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
    mutationFn: withErrorHandler<
      [{ provider: string; enabled: boolean; clientId?: string; clientSecret?: string }],
      void
    >(
      async ({ provider, ...body }) => authClient.request({
        url: apiUrl(`/dashboard/tenant-settings/social/${provider}`),
        method: "PATCH",
        body,
      }),
      { errorMessage: "Failed to update social provider", showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "settings"] }),
  });
}

// ── Passkey Management ─────────────────────────────────────────────

export function useListPasskeys() {
  return useQuery<PasskeyCredential[]>({
    queryKey: ["passkeys"],
    queryFn: withErrorHandler<[], PasskeyCredential[]>(
      async () => authClient.listPasskeys()
    ),
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (credentialId: string) => authClient.deletePasskey(credentialId),
      { successMessage: "Passkey deleted", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  });
}

// ── Social Connections ─────────────────────────────────────────────

export function useSocialConnections() {
  return useQuery<SocialConnection[]>({
    queryKey: ["social-connections"],
    queryFn: withErrorHandler<[], SocialConnection[]>(
      async () => authClient.getSocialConnections()
    ),
  });
}

export function useUnlinkSocialAccount() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (provider: string) => authClient.unlinkSocialAccount(provider),
      { successMessage: "Account unlinked", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-connections"] }),
  });
}

// ─── Tenant Admin Dashboard ──────────────────────────────────────

export function useTenantUsers(params: {
  search?: string;
  status?: "active" | "suspended" | "all";
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status === "active") qs.set("isActive", "true");
  if (params.status === "suspended") qs.set("isActive", "false");
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 20));

  return useQuery<UserListResponse>({
    queryKey: ["tenant", "users", params],
    queryFn: withErrorHandler<[], UserListResponse>(
      async () => authClient.request({
        url: apiUrl(`/users?${qs.toString()}`),
        method: "GET",
      })
    ),
  });
}

export function useTenantUser(userId: string) {
  return useQuery<DashboardUser>({
    queryKey: ["tenant", "users", userId],
    queryFn: withErrorHandler<[], DashboardUser>(
      async () => authClient.request({
        url: apiUrl(`/users/${userId}`),
        method: "GET",
      })
    ),
    enabled: !!userId,
  });
}

export function useTenantRoles() {
  return useQuery<Role[]>({
    queryKey: ["tenant", "roles"],
    queryFn: withErrorHandler<[], Role[]>(
      async () => authClient.request({
        url: apiUrl(`/rbac/roles?loadPermissions=true`),
        method: "GET",
      })
    ),
  });
}

export function useTenantClients() {
  return useQuery<Client[]>({
    queryKey: ["tenant", "clients"],
    queryFn: withErrorHandler<[], Client[]>(
      async () => authClient.request({
        url: apiUrl(`/oauth/clients`),
        method: "GET",
      })
    ),
  });
}

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

export function useTenantMetrics() {
  return useQuery<TenantMetrics>({
    queryKey: ["tenant", "metrics"],
    queryFn: withErrorHandler<[], TenantMetrics>(
      async () => authClient.request({
        url: apiUrl("/dashboard/tenant-metrics"),
        method: "GET",
      })
    ),
  });
}

export function useTenantActivity(limit = 20) {
  return useQuery<ActivityEvent[]>({
    queryKey: ["tenant", "activity", limit],
    queryFn: withErrorHandler<[], ActivityEvent[]>(
      async () => authClient.request({
        url: apiUrl(`/dashboard/tenant-activity?limit=${limit}`),
        method: "GET",
      })
    ),
  });
}

export function useApiCallTrend(days: 7 | 14 | 30 = 7) {
  return useQuery<TrendPoint[]>({
    queryKey: ["tenant", "api-call-trend", days],
    queryFn: withErrorHandler<[], TrendPoint[]>(
      async () => authClient.request({
        url: apiUrl(`/dashboard/api-call-trend?days=${days}`),
        method: "GET",
      })
    ),
  });
}

export function useAuthBreakdown() {
  return useQuery<AuthBreakdown>({
    queryKey: ["tenant", "auth-breakdown"],
    queryFn: withErrorHandler<[], AuthBreakdown>(
      async () => authClient.request({
        url: apiUrl("/dashboard/auth-breakdown"),
        method: "GET",
      })
    ),
  });
}

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

// ── Tenant Branding ──────────────────────────────────────────

export function useBranding() {
  return useQuery<BrandingConfig>({
    queryKey: ["tenant", "branding"],
    queryFn: withErrorHandler<[], BrandingConfig>(
      async () => authClient.request({
        url: apiUrl("/tenants/current/branding"),
        method: "GET",
      })
    ),
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation<BrandingConfig, Error, Partial<BrandingConfig>>({
    mutationFn: withErrorHandler<[Partial<BrandingConfig>], BrandingConfig>(
      async (body) => authClient.request({
        url: apiUrl("/tenants/current/branding"),
        method: "PUT",
        body,
      }),
      { successMessage: "Branding updated successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "branding"] }),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation<{ logoUrl: string }, Error, File>({
    mutationFn: withErrorHandler<[File], { logoUrl: string }>(
      async (file: File) => {
        const formData = new FormData();
        formData.append("logo", file);
        return authClient.request({
          url: `${authClient.getBaseURL()}/tenants/current/branding/logo`,
          method: "POST",
          body: formData,
        });
      },
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "branding"] }),
  });
}

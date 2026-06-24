import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
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
  Permission,
  Policy,
  PolicyDocument,
  UserRoleAssignment,
  SimulateResult,
} from "./types";

function apiUrl(path: string): string {
  return `${authClient.getBaseURL()}${path}`;
}

// ─── User Workspaces ─────────────────────────────────────────

export interface UserWorkspace {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

export function useUserWorkspaces() {
  return useQuery<UserWorkspace[]>({
    queryKey: ['user', 'workspaces'],
    queryFn: withErrorHandler<[], UserWorkspace[]>(
      async () => authClient.getUserOrgs()
    ),
    staleTime: 5 * 60_000,
  });
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
  return useMutation<{ backupCodes: string[]; message?: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { backupCodes: string[]; message?: string }>(
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

export function useRequestEmailOtp() {
  return useMutation<{ message: string; expiresIn: string }, Error, void>({
    mutationFn: withErrorHandler<[], { message: string; expiresIn: string }>(
      async () => authClient.request({ url: apiUrl("/mfa/request-email-otp"), method: "POST" }),
      { successMessage: "Verification code sent to your email", showSuccessToast: true }
    ),
  });
}

export function useVerifyEmailOtp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (code: string) => authClient.request({
        url: apiUrl("/mfa/verify-email-otp"),
        method: "POST",
        body: { code },
      }),
      { successMessage: "Email MFA enabled successfully", showSuccessToast: true, errorMessage: "Invalid or expired code. Please try again.", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableAllMfa() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: withErrorHandler<[], void>(
      async () => authClient.request({ url: apiUrl("/mfa/all"), method: "DELETE" }),
      { successMessage: "All MFA methods disabled successfully", showSuccessToast: true, errorMessage: "Failed to disable MFA", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRegenerateBackupCodes() {
  const qc = useQueryClient();
  return useMutation<{ backupCodes: string[]; count: number }, Error, void>({
    mutationFn: withErrorHandler<[], { backupCodes: string[]; count: number }>(
      async () => authClient.request({
        url: apiUrl("/mfa/backup-codes/regenerate"),
        method: "POST",
      }),
      { successMessage: "Backup codes regenerated successfully", showSuccessToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
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

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation<Role, Error, { name: string; description?: string }>({
    mutationFn: withErrorHandler<[{ name: string; description?: string }], Role>(
      async (body) => authClient.request({
        url: apiUrl("/rbac/roles"),
        method: "POST",
        body,
      }),
      { successMessage: "Role created successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation<Role, Error, { id: string; name: string; description?: string }>({
    mutationFn: withErrorHandler<[{ id: string; name: string; description?: string }], Role>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/rbac/roles/${id}`),
        method: "PUT",
        body,
      }),
      { successMessage: "Role updated successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/rbac/roles/${id}`),
        method: "DELETE",
      }),
      { successMessage: "Role deleted successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
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

export function useCreateTenantClient() {
  const qc = useQueryClient();
  return useMutation<Client & { clientSecret: string }, Error, { name: string; clientType: string; redirectUris?: string[]; grantTypes?: string[] }>({
    mutationFn: withErrorHandler<[{ name: string; clientType: string; redirectUris?: string[]; grantTypes?: string[] }], Client & { clientSecret: string }>(
      async (body) => authClient.request({
        url: apiUrl("/oauth/clients"),
        method: "POST",
        body,
      }),
      { successMessage: "Client created successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useUpdateTenantClient() {
  const qc = useQueryClient();
  return useMutation<Client, Error, { id: string; name?: string; redirectUris?: string[]; grantTypes?: string[]; isActive?: boolean }>({
    mutationFn: withErrorHandler<[{ id: string; name?: string; redirectUris?: string[]; grantTypes?: string[]; isActive?: boolean }], Client>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}`),
        method: "PUT",
        body,
      }),
      { successMessage: "Client updated successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useDeleteTenantClient() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}`),
        method: "DELETE",
      }),
      { successMessage: "Client deleted successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useRotateClientSecret() {
  return useMutation<{ clientSecret: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { clientSecret: string }>(
      async (id) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}/rotate-secret`),
        method: "POST",
      }),
      { successMessage: "Client secret rotated successfully", showSuccessToast: true }
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

// ─── Tenant MFA Policy ───────────────────────────────────────

export interface TenantMfaPolicy {
  id?: string;
  enforceForAllUsers: boolean;
  enforceForAdmins: boolean;
  gracePeriodDays: number;
  exemptRoleSlugs: string[];
}

export function useTenantMfaPolicy() {
  return useQuery<TenantMfaPolicy>({
    queryKey: ['tenant', 'mfa-policy'],
    queryFn: withErrorHandler<[], TenantMfaPolicy>(
      async () => authClient.request({ url: apiUrl('/tenant/mfa-policy'), method: 'GET' })
    ),
  });
}

export function useUpdateTenantMfaPolicy() {
  const qc = useQueryClient();
  return useMutation<TenantMfaPolicy, Error, TenantMfaPolicy>({
    mutationFn: withErrorHandler<[TenantMfaPolicy], TenantMfaPolicy>(
      async (body) => authClient.request({ url: apiUrl('/tenant/mfa-policy'), method: 'PATCH', body }),
      { successMessage: 'MFA policy updated', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'mfa-policy'] }),
  });
}

// ── Sprint 4: Webhooks ────────────────────────────────────────

export function useWebhooks() {
  return useQuery<WebhookEndpoint[]>({
    queryKey: ["webhooks"],
    queryFn: withErrorHandler<[], WebhookEndpoint[]>(
      async () => authClient.request({ url: apiUrl("/webhooks"), method: "GET" })
    ),
  });
}

export function useWebhookDeliveries(endpointId: string) {
  return useQuery<WebhookDelivery[]>({
    queryKey: ["webhooks", endpointId, "deliveries"],
    queryFn: withErrorHandler<[], WebhookDelivery[]>(
      async () => authClient.request({ url: apiUrl(`/webhooks/${endpointId}/deliveries`), method: "GET" })
    ),
    enabled: !!endpointId,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation<WebhookEndpoint, Error, { url: string; events: string[]; description?: string }>({
    mutationFn: withErrorHandler<[{ url: string; events: string[]; description?: string }], WebhookEndpoint>(
      async (body) => authClient.request({ url: apiUrl("/webhooks"), method: "POST", body }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id: string) => authClient.request({ url: apiUrl(`/webhooks/${id}`), method: "DELETE" }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useTestWebhook() {
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id: string) => authClient.request({ url: apiUrl(`/webhooks/${id}/test`), method: "POST" }),
      { successMessage: "Test event sent", showSuccessToast: true }
    ),
  });
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  return useMutation<{ secret: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { secret: string }>(
      async (id: string) => authClient.request({ url: apiUrl(`/webhooks/${id}/rotate-secret`), method: "POST" }),
      { successMessage: "Secret rotated", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

// ── Sprint 4: SAML ────────────────────────────────────────────

export function useSamlSPs() {
  return useQuery<SamlServiceProvider[]>({
    queryKey: ["saml", "sps"],
    queryFn: withErrorHandler<[], SamlServiceProvider[]>(
      async () => authClient.request({ url: apiUrl("/saml/sps"), method: "GET" })
    ),
  });
}

export function useCreateSamlSP() {
  const qc = useQueryClient();
  return useMutation<
    SamlServiceProvider,
    Error,
    { name: string; entityId: string; acsUrl: string; sloUrl?: string; certificate?: string; metadataUrl?: string }
  >({
    mutationFn: withErrorHandler<
      [{ name: string; entityId: string; acsUrl: string; sloUrl?: string; certificate?: string; metadataUrl?: string }],
      SamlServiceProvider
    >(
      async (body) => authClient.request({ url: apiUrl("/saml/sps"), method: "POST", body }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saml", "sps"] }),
  });
}

export function useDeleteSamlSP() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id: string) => authClient.request({ url: apiUrl(`/saml/sps/${id}`), method: "DELETE" }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saml", "sps"] }),
  });
}

// ── Sprint 4: SCIM ────────────────────────────────────────────

export function useScimTokens() {
  return useQuery<ScimToken[]>({
    queryKey: ["scim", "tokens"],
    queryFn: withErrorHandler<[], ScimToken[]>(
      async () => authClient.request({ url: apiUrl("/scim/tokens"), method: "GET" })
    ),
  });
}

export function useCreateScimToken() {
  const qc = useQueryClient();
  return useMutation<{ token: string } & ScimToken, Error, { name: string; expiresAt?: string }>({
    mutationFn: withErrorHandler<[{ name: string; expiresAt?: string }], { token: string } & ScimToken>(
      async (body) => authClient.request({ url: apiUrl("/scim/tokens"), method: "POST", body }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scim", "tokens"] }),
  });
}

export function useRevokeScimToken() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id: string) => authClient.request({ url: apiUrl(`/scim/tokens/${id}`), method: "DELETE" }),
      { successMessage: "Token revoked", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scim", "tokens"] }),
  });
}

// ── Sprint 4: LDAP ────────────────────────────────────────────

export function useLdapConnections() {
  return useQuery<LdapConnection[]>({
    queryKey: ["ldap", "connections"],
    queryFn: withErrorHandler<[], LdapConnection[]>(
      async () => authClient.request({ url: apiUrl("/ldap/connections"), method: "GET" })
    ),
  });
}

export function useCreateLdapConnection() {
  const qc = useQueryClient();
  return useMutation<LdapConnection, Error, Partial<LdapConnection> & { bindPassword: string }>({
    mutationFn: withErrorHandler<[Partial<LdapConnection> & { bindPassword: string }], LdapConnection>(
      async (body) => authClient.request({ url: apiUrl("/ldap/connections"), method: "POST", body }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ldap", "connections"] }),
  });
}

export function useDeleteLdapConnection() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id: string) => authClient.request({ url: apiUrl(`/ldap/connections/${id}`), method: "DELETE" }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ldap", "connections"] }),
  });
}

export function useTestLdapConnection() {
  return useMutation<{ success: boolean; message: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { success: boolean; message: string }>(
      async (id: string) => authClient.request({ url: apiUrl(`/ldap/connections/${id}/test`), method: "POST" }),
      { showErrorToast: true }
    ),
  });
}

export function useSyncLdap() {
  const qc = useQueryClient();
  return useMutation<{ usersCreated: number; usersUpdated: number }, Error, string>({
    mutationFn: withErrorHandler<[string], { usersCreated: number; usersUpdated: number }>(
      async (id: string) => authClient.request({ url: apiUrl(`/ldap/connections/${id}/sync`), method: "POST" }),
      { successMessage: "LDAP sync started", showSuccessToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ldap", "connections"] });
      qc.invalidateQueries({ queryKey: ["tenant", "users"] });
    },
  });
}

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

// ── Server-side Audit Log ─────────────────────────────────────

export interface AuditLogFilters {
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

function buildAuditQs(filters: AuditLogFilters & { cursor?: string }): string {
  const qs = new URLSearchParams();
  if (filters.eventType) qs.set("eventType", filters.eventType);
  if (filters.startDate) qs.set("startDate", filters.startDate);
  if (filters.endDate) qs.set("endDate", filters.endDate);
  qs.set("limit", String(filters.limit ?? 50));
  if (filters.cursor) qs.set("cursor", filters.cursor);
  return qs.toString();
}

export function useAuditLogsFiltered(filters: AuditLogFilters & { cursor?: string }) {
  return useQuery<{ items: ActivityEvent[]; nextCursor: string | null; total: number }>({
    queryKey: ["audit", "filtered", filters],
    queryFn: withErrorHandler<[], { items: ActivityEvent[]; nextCursor: string | null; total: number }>(
      async () => authClient.request({
        url: apiUrl(`/audit?${buildAuditQs(filters)}`),
        method: "GET",
      })
    ),
  });
}

const fetchAuditPage = withErrorHandler<
  [AuditLogFilters & { cursor?: string }],
  { items: ActivityEvent[]; nextCursor: string | null; total: number }
>(
  async (f) =>
    authClient.request({
      url: apiUrl(`/audit?${buildAuditQs(f)}`),
      method: "GET",
    }),
);

export function useAuditLogsInfinite(filters: AuditLogFilters) {
  return useInfiniteQuery<
    { items: ActivityEvent[]; nextCursor: string | null; total: number },
    Error,
    { pages: Array<{ items: ActivityEvent[]; nextCursor: string | null; total: number }> },
    string[],
    string | undefined
  >({
    queryKey: ["audit", "infinite", filters.eventType ?? "", filters.startDate ?? "", filters.endDate ?? ""],
    queryFn: ({ pageParam }) => fetchAuditPage({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined,
  });
}

export function useExportAuditCsv(tenantSlug?: string) {
  return useMutation<void, Error, AuditLogFilters>({
    mutationFn: async (filters) => {
      const qs = buildAuditQs(filters);
      const url = `${authClient.getBaseURL()}/audit/export?${qs}`;

      // Use fetch (not bare <a href>) so we can inject auth headers — a bare
      // navigation cannot send X-Tenant-Slug, which breaks local dev where
      // tenant resolution falls back to the header instead of subdomain.
      const accessToken = await authClient.getAccessToken();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      if (tenantSlug) {
        headers['X-Tenant-Slug'] = tenantSlug;
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `audit-${tenantSlug ?? 'export'}-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    },
  });
}

// ── RBAC: Permissions ────────────────────────────────────────────

export function usePermissions() {
  return useQuery<Permission[]>({
    queryKey: ['rbac', 'permissions'],
    queryFn: withErrorHandler<[], Permission[]>(
      async () => authClient.request({ url: apiUrl('/rbac/permissions'), method: 'GET' })
    ),
  });
}

export function useAssignPermissionsToRole() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { roleId: string; permissionNames: string[] }>({
    mutationFn: withErrorHandler<[{ roleId: string; permissionNames: string[] }], { message: string }>(
      async ({ roleId, permissionNames }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/permissions`),
        method: 'POST',
        body: { permissionNames },
      }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'roles'] }),
  });
}

export function useRemovePermissionsFromRole() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { roleId: string; permissionNames: string[] }>({
    mutationFn: withErrorHandler<[{ roleId: string; permissionNames: string[] }], { message: string }>(
      async ({ roleId, permissionNames }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/permissions`),
        method: 'DELETE',
        body: { permissionNames },
      }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'roles'] }),
  });
}

export function useRolePolicies(roleId: string) {
  return useQuery<Policy[]>({
    queryKey: ['rbac', 'roles', roleId, 'policies'],
    queryFn: withErrorHandler<[], Policy[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/roles/${roleId}/policies`), method: 'GET' })
    ),
    enabled: !!roleId,
  });
}

// ── RBAC: User Roles ────────────────────────────────────────────

export function useUserRoles(userId: string) {
  return useQuery<UserRoleAssignment[]>({
    queryKey: ['rbac', 'users', userId, 'roles'],
    queryFn: withErrorHandler<[], UserRoleAssignment[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/users/${userId}/roles`), method: 'GET' })
    ),
    enabled: !!userId,
  });
}

export function useAssignRolesToUser() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { userId: string; roleNames: string[]; expiresAt?: string; reason?: string }>({
    mutationFn: withErrorHandler<[{ userId: string; roleNames: string[]; expiresAt?: string; reason?: string }], { message: string }>(
      async ({ userId, ...body }) => authClient.request({
        url: apiUrl(`/rbac/users/${userId}/roles`),
        method: 'POST',
        body,
      }),
      { successMessage: 'Role assigned', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ['rbac', 'users', userId, 'roles'] }),
  });
}

export function useRevokeRoleFromUser() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { userId: string; roleName: string }>({
    mutationFn: withErrorHandler<[{ userId: string; roleName: string }], { message: string }>(
      async ({ userId, roleName }) => authClient.request({
        url: apiUrl(`/rbac/users/${userId}/roles/${roleName}`),
        method: 'DELETE',
      }),
      { successMessage: 'Role revoked', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ['rbac', 'users', userId, 'roles'] }),
  });
}

export function useUserEffectivePermissions(userId: string) {
  return useQuery<Permission[]>({
    queryKey: ['rbac', 'users', userId, 'permissions'],
    queryFn: withErrorHandler<[], Permission[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/users/${userId}/permissions`), method: 'GET' })
    ),
    enabled: !!userId,
  });
}

// ── RBAC: Policies ────────────────────────────────────────────

export function usePolicies() {
  return useQuery<{ data: Policy[]; total: number }>({
    queryKey: ['rbac', 'policies'],
    queryFn: withErrorHandler<[], { data: Policy[]; total: number }>(
      async () => authClient.request({ url: apiUrl('/rbac/policies?limit=100'), method: 'GET' })
    ),
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation<Policy, Error, { name: string; description?: string; document: PolicyDocument; type?: 'inline' | 'managed' }>({
    mutationFn: withErrorHandler<[{ name: string; description?: string; document: PolicyDocument; type?: 'inline' | 'managed' }], Policy>(
      async (body) => authClient.request({
        url: apiUrl('/rbac/policies'),
        method: 'POST',
        body,
      }),
      { successMessage: 'Policy created', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation<Policy, Error, { id: string; description?: string; document?: PolicyDocument }>({
    mutationFn: withErrorHandler<[{ id: string; description?: string; document?: PolicyDocument }], Policy>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/rbac/policies/${id}`),
        method: 'PUT',
        body,
      }),
      { successMessage: 'Policy updated', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/rbac/policies/${id}`),
        method: 'DELETE',
      }),
      { successMessage: 'Policy deleted', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useAttachPolicyToRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, { roleId: string; policyId: string }>({
    mutationFn: withErrorHandler<[{ roleId: string; policyId: string }], void>(
      async ({ roleId, policyId }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/policies/${policyId}`),
        method: 'POST',
      }),
      { successMessage: 'Policy attached', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { roleId }) => qc.invalidateQueries({ queryKey: ['rbac', 'roles', roleId, 'policies'] }),
  });
}

export function useDetachPolicyFromRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, { roleId: string; policyId: string }>({
    mutationFn: withErrorHandler<[{ roleId: string; policyId: string }], void>(
      async ({ roleId, policyId }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/policies/${policyId}`),
        method: 'DELETE',
      }),
      { successMessage: 'Policy detached', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { roleId }) => qc.invalidateQueries({ queryKey: ['rbac', 'roles', roleId, 'policies'] }),
  });
}

export function useSimulatePolicy() {
  return useMutation<SimulateResult, Error, { userId: string; action: string; resource: string; ipAddress?: string; mfaVerified?: boolean }>({
    mutationFn: withErrorHandler<[{ userId: string; action: string; resource: string; ipAddress?: string; mfaVerified?: boolean }], SimulateResult>(
      async (body) => authClient.request({
        url: apiUrl('/rbac/policies/simulate'),
        method: 'POST',
        body,
      }),
      { showErrorToast: true }
    ),
  });
}

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

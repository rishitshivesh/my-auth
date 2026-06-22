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
        url: apiUrl(`/oauth/clients/${id}/rotate`),
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

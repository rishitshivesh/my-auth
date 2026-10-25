import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { TenantSettings } from "@/lib/types";
import { apiUrl } from "./shared";

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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { BrandingConfig } from "@/lib/types";
import { apiUrl } from "./shared";

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

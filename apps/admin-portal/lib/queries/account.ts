import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { PasskeyCredential, SocialConnection } from "@/lib/types";

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

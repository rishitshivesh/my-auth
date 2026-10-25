import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { LdapConnection, SamlServiceProvider, ScimToken, WebhookDelivery, WebhookEndpoint } from "@/lib/types";
import { apiUrl } from "./shared";

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

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME_MS } from "@/constants/limits";
import { apiCall } from "@/features/applications/api/request";
import { useIntegrationsKeys } from "@/hooks/use-integrations-scope";
import type {
  CreateLdapBody, CreateScimTokenBody, CreatedScimToken, LdapConnection, LdapTestResult, RegisterSamlBody,
  SamlServiceProvider, ScimTokenRecord, TenantSettingsResponse, UpdateSocialProviderBody,
} from "../model/types";

const enc = encodeURIComponent;

export function useSocialSettings(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.connections.custom("social"),
    queryFn: () => apiCall<TenantSettingsResponse>("GET", "/dashboard/tenant-settings")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useUpdateSocialProvider(slug: string, provider: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: (body: UpdateSocialProviderBody) =>
      apiCall<{ message?: string }, UpdateSocialProviderBody>("PATCH", `/dashboard/tenant-settings/social/${enc(provider)}`)(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.connections.custom("social") }),
  });
}

export function useSamlProviders(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.connections.custom("saml"),
    queryFn: () => apiCall<SamlServiceProvider[]>("GET", "/saml/sps")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useSamlMutations(slug: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.connections.custom("saml") });
  return {
    register: useMutation({
      mutationFn: (body: RegisterSamlBody) => apiCall<SamlServiceProvider, RegisterSamlBody>("POST", "/saml/sps")(body),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: (input: { id: string; active: boolean }) =>
        apiCall<SamlServiceProvider, { active: boolean }>("PATCH", `/saml/sps/${enc(input.id)}`)({ active: input.active }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiCall<void>("DELETE", `/saml/sps/${enc(id)}`)(),
      onSuccess: invalidate,
    }),
  };
}

export function useScimTokens(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.connections.custom("scim"),
    queryFn: () => apiCall<ScimTokenRecord[]>("GET", "/scim/tokens")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useScimMutations(slug: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.connections.custom("scim") });
  return {
    create: useMutation({
      mutationFn: (body: CreateScimTokenBody) => apiCall<CreatedScimToken, CreateScimTokenBody>("POST", "/scim/tokens")(body),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (id: string) => apiCall<void>("DELETE", `/scim/tokens/${enc(id)}`)(),
      onSuccess: invalidate,
    }),
  };
}

export function useLdapConnections(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.connections.custom("ldap"),
    queryFn: () => apiCall<LdapConnection[]>("GET", "/ldap/connections")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useLdapMutations(slug: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.connections.custom("ldap") });
  return {
    create: useMutation({
      mutationFn: (body: CreateLdapBody) => apiCall<LdapConnection, CreateLdapBody>("POST", "/ldap/connections")(body),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: (input: { id: string; active: boolean }) =>
        apiCall<LdapConnection, { active: boolean }>("PATCH", `/ldap/connections/${enc(input.id)}`)({ active: input.active }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiCall<void>("DELETE", `/ldap/connections/${enc(id)}`)(),
      onSuccess: invalidate,
    }),
    test: useMutation({
      mutationFn: (id: string) => apiCall<LdapTestResult>("POST", `/ldap/connections/${enc(id)}/test`)(),
    }),
    sync: useMutation({
      mutationFn: (id: string) => apiCall<unknown>("POST", `/ldap/connections/${enc(id)}/sync`)(),
      onSuccess: invalidate,
    }),
  };
}

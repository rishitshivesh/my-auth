"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/constants/query-keys";
import { apiRequest } from "@/lib/api-request";
import { useQueryScope } from "@/lib/query-scope";
import type { PasswordPolicy } from "../model/password-policy";

export function usePasswordPolicy(slug: string) {
  const scope = useQueryScope(slug);
  return useQuery({
    queryKey: queryKeys(scope).settings.custom("password-policy"),
    queryFn: () => apiRequest<PasswordPolicy>("GET", "/tenants/current/password-policy"),
  });
}

export function useSavePasswordPolicy(slug: string) {
  const scope = useQueryScope(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (policy: PasswordPolicy) =>
      apiRequest<PasswordPolicy>("PUT", "/tenants/current/password-policy", { body: policy }),
    onSuccess: (saved) => client.setQueryData(queryKeys(scope).settings.custom("password-policy"), saved),
  });
}

export function useAllowedOrigins(slug: string) {
  const scope = useQueryScope(slug);
  return useQuery({
    queryKey: queryKeys(scope).settings.custom("allowed-origins"),
    queryFn: () => apiRequest<{ origins: string[] }>("GET", "/tenants/current/allowed-origins"),
  });
}

export function useSaveAllowedOrigins(slug: string) {
  const scope = useQueryScope(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (origins: string[]) =>
      apiRequest<{ origins: string[] }>("PUT", "/tenants/current/allowed-origins", { body: { origins } }),
    onSuccess: (saved) => client.setQueryData(queryKeys(scope).settings.custom("allowed-origins"), saved),
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/constants/query-keys";
import { apiRequest } from "@/lib/api-request";
import { useQueryScope } from "@/lib/query-scope";
import type { TenantContext, TenantSettings } from "../model/settings";

export function useTenantContext(slug: string) {
  const scope = useQueryScope(slug);
  return useQuery({
    queryKey: queryKeys(scope).settings.custom("context"),
    queryFn: () => apiRequest<TenantContext>("GET", "/tenants/current"),
  });
}

export function useTenantSettings(slug: string) {
  const scope = useQueryScope(slug);
  return useQuery({
    queryKey: queryKeys(scope).settings.detail("login-methods"),
    queryFn: () => apiRequest<TenantSettings>("GET", "/dashboard/tenant-settings"),
  });
}

export function useUpdateFlags(slug: string) {
  const scope = useQueryScope(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (featureFlags: Record<string, boolean>) =>
      apiRequest<{ message: string }>("PATCH", "/dashboard/tenant-settings", { body: { featureFlags } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys(scope).settings.all() }),
  });
}

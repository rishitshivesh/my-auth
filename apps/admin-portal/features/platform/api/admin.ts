"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLATFORM_TENANT, queryKeys } from "@/constants/query-keys";
import { apiRequest } from "@/lib/api-request";
import { useQueryScope } from "@/lib/query-scope";
import { tenantsQueryString, type NewTenantDraft, type TenantsQuery } from "../model/tenants";
import type {
  ActivityItem, PlatformMetrics, PlatformSettings, TeamMember, TenantDetail, TenantsPage,
} from "../model/types";

const keys = (scope: ReturnType<typeof useQueryScope>) => queryKeys(scope);

export function usePlatformMetrics() {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).settings.custom("metrics"),
    queryFn: () => apiRequest<PlatformMetrics>("GET", "/admin/dashboard"),
  });
}

export function usePlatformActivity(limit: number) {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).audit.list({ limit }),
    queryFn: () => apiRequest<ActivityItem[]>("GET", `/admin/activity?limit=${limit}`),
  });
}

export function useTenants(query: TenantsQuery) {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).tenants.list({ ...query }),
    queryFn: () => apiRequest<TenantsPage>("GET", `/admin/tenants?${tenantsQueryString(query)}`),
    placeholderData: (previous) => previous,
  });
}

export function useTenant(id: string) {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).tenants.detail(id),
    queryFn: () => apiRequest<TenantDetail>("GET", `/admin/tenants/${encodeURIComponent(id)}`),
  });
}

export function useSlugCheck(slug: string, enabled: boolean) {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).tenants.custom("slug", slug),
    enabled,
    staleTime: 5_000,
    queryFn: () =>
      apiRequest<{ available: boolean; reason?: string }>("GET", `/admin/tenants/check-slug?slug=${encodeURIComponent(slug)}`),
  });
}

export function useCreateTenant() {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: NewTenantDraft) => apiRequest<TenantDetail>("POST", "/admin/tenants", { body: draft }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys(scope).tenants.all() }),
  });
}

export function useUpdateTenant(id: string) {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: string; name?: string; plan?: string }) =>
      apiRequest<TenantDetail>("PATCH", `/admin/tenants/${encodeURIComponent(id)}`, { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys(scope).tenants.all() }),
  });
}

export function useDeleteTenant(id: string) {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>("DELETE", `/admin/tenants/${encodeURIComponent(id)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys(scope).tenants.all() }),
  });
}

export function useTeam() {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).settings.custom("team"),
    queryFn: () => apiRequest<TeamMember[]>("GET", "/admin/team"),
  });
}

export function useAddTeamMember() {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => apiRequest<TeamMember>("POST", "/admin/team", { body: { email } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys(scope).settings.custom("team") }),
  });
}

export function useRemoveTeamMember() {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiRequest<void>("DELETE", `/admin/team/${encodeURIComponent(userId)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys(scope).settings.custom("team") }),
  });
}

export function usePlatformSettings() {
  const scope = useQueryScope(PLATFORM_TENANT);
  return useQuery({
    queryKey: keys(scope).settings.custom("platform"),
    queryFn: () => apiRequest<PlatformSettings>("GET", "/admin/settings"),
  });
}

export function useSavePlatformSettings() {
  const scope = useQueryScope(PLATFORM_TENANT);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PlatformSettings>) => apiRequest<PlatformSettings>("PATCH", "/admin/settings", { body }),
    onSuccess: (saved) => client.setQueryData(keys(scope).settings.custom("platform"), saved),
  });
}

export function useTokenCleanup() {
  return useMutation({
    mutationFn: () => apiRequest<{ message: string; deleted: number; durationMs: number }>("POST", "/admin/cleanup/tokens"),
  });
}

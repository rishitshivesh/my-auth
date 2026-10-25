"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/constants/query-keys";
import { apiRequest } from "@/lib/api-request";
import { useQueryScope } from "@/lib/query-scope";
import { brandingPayload, type Branding } from "../model/branding";

export function useBranding(slug: string) {
  const scope = useQueryScope(slug);
  return useQuery({
    queryKey: queryKeys(scope).branding.all(),
    queryFn: () => apiRequest<Branding>("GET", "/tenants/current/branding"),
  });
}

export function useSaveBranding(slug: string) {
  const scope = useQueryScope(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: Branding) =>
      apiRequest<Branding>("PUT", "/tenants/current/branding", { body: brandingPayload(draft) }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys(scope).branding.all() }),
  });
}

export function useUploadLogo(slug: string) {
  const scope = useQueryScope(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("logo", file);
      return apiRequest<{ logoUrl: string }>("POST", "/tenants/current/branding/logo", { body });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys(scope).branding.all() }),
  });
}

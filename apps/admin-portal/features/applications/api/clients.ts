"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntegrationsKeys } from "@/hooks/use-integrations-scope";
import { DEFAULT_STALE_TIME_MS } from "@/constants/limits";
import type { CreateClientBody, CreatedOAuthClient, OAuthClient, RotatedSecret, UpdateClientBody } from "../model/types";
import { apiCall } from "./request";

const clientPath = (clientId: string) => `/oauth/clients/${encodeURIComponent(clientId)}`;

export function useClients(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.clients.list(),
    queryFn: () => apiCall<OAuthClient[]>("GET", "/oauth/clients")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useClient(slug: string, clientId: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.clients.detail(clientId),
    queryFn: () => apiCall<OAuthClient>("GET", clientPath(clientId))(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useCreateClient(slug: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: (body: CreateClientBody) => apiCall<CreatedOAuthClient, CreateClientBody>("POST", "/oauth/clients")(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clients.all() }),
  });
}

export function useUpdateClient(slug: string, clientId: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: (body: UpdateClientBody) => apiCall<{ message?: string }, UpdateClientBody>("PUT", clientPath(clientId))(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clients.all() }),
  });
}

export function useDeleteClient(slug: string, clientId: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: () => apiCall<void>("DELETE", clientPath(clientId))(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clients.all() }),
  });
}

export function useRotateClientSecret(slug: string, clientId: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: () => apiCall<RotatedSecret>("POST", `${clientPath(clientId)}/rotate-secret`)(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clients.detail(clientId) }),
  });
}

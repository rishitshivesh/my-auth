"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME_MS } from "@/constants/limits";
import { apiCall } from "@/features/applications/api/request";
import { useIntegrationsKeys } from "@/hooks/use-integrations-scope";
import { DELIVERY_LIMIT } from "../model/webhooks";
import type {
  CreateWebhookBody, RotatedWebhookSecret, UpdateWebhookBody, WebhookDelivery, WebhookEndpoint,
} from "../model/types";

const enc = encodeURIComponent;

export function useWebhooks(slug: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.webhooks.list(),
    queryFn: () => apiCall<WebhookEndpoint[]>("GET", "/webhooks")(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useWebhook(slug: string, id: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.webhooks.detail(id),
    queryFn: () => apiCall<WebhookEndpoint>("GET", `/webhooks/${enc(id)}`)(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useWebhookDeliveries(slug: string, id: string) {
  const keys = useIntegrationsKeys(slug);
  return useQuery({
    queryKey: keys.webhooks.custom("deliveries", id),
    queryFn: () => apiCall<WebhookDelivery[]>("GET", `/webhooks/${enc(id)}/deliveries?limit=${DELIVERY_LIMIT}`)(),
  });
}

export function useWebhookMutations(slug: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.webhooks.all() });
  return {
    create: useMutation({
      mutationFn: (body: CreateWebhookBody) => apiCall<WebhookEndpoint, CreateWebhookBody>("POST", "/webhooks")(body),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: (input: { id: string; active: boolean }) =>
        apiCall<WebhookEndpoint, UpdateWebhookBody>("PATCH", `/webhooks/${enc(input.id)}`)({ active: input.active }),
      onSuccess: invalidate,
    }),
    rotate: useMutation({
      mutationFn: (id: string) => apiCall<RotatedWebhookSecret>("POST", `/webhooks/${enc(id)}/rotate-secret`)(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiCall<void>("DELETE", `/webhooks/${enc(id)}`)(),
      onSuccess: invalidate,
    }),
    test: useMutation({
      mutationFn: (id: string) => apiCall<unknown>("POST", `/webhooks/${enc(id)}/test`)(),
      onSuccess: invalidate,
    }),
  };
}

export function useRedeliver(slug: string, endpointId: string) {
  const qc = useQueryClient();
  const keys = useIntegrationsKeys(slug);
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiCall<unknown>("POST", `/webhooks/${enc(endpointId)}/deliveries/${enc(deliveryId)}/redeliver`)(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.webhooks.custom("deliveries", endpointId) }),
  });
}

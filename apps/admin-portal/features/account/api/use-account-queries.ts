"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME_MS } from "@/constants/limits";
import { accountApi } from "./account-api";
import { useAccountEnabled, useAccountKeys } from "./use-account-scope";

type Resource = "profile" | "mfa" | "passkeys" | "connections" | "sessions" | "events";

function useResource<T>(resource: Resource, fetcher: () => Promise<T>, extra: readonly (string | number)[] = []) {
  const keys = useAccountKeys();
  const enabled = useAccountEnabled();
  return useQuery<T>({
    queryKey: keys.custom(resource, ...extra),
    queryFn: fetcher,
    enabled,
    staleTime: DEFAULT_STALE_TIME_MS,
    retry: false,
  });
}

export const useProfileQuery = () => useResource("profile", accountApi.getProfile);
export const useMfaStatusQuery = () => useResource("mfa", accountApi.getMfaStatus);
export const usePasskeysQuery = () => useResource("passkeys", accountApi.listPasskeys);
export const useConnectionsQuery = () => useResource("connections", accountApi.listConnections);
export const useSessionsQuery = () => useResource("sessions", accountApi.listSessions);
export const useSecurityEventsQuery = (limit: number) =>
  useResource("events", () => accountApi.listSecurityEvents(limit), [limit]);

/** Refresh one cached resource after the server confirmed a change. */
export function useRefresh() {
  const client = useQueryClient();
  const keys = useAccountKeys();
  return useCallback(
    (...resources: Resource[]) =>
      Promise.all(resources.map((r) => client.invalidateQueries({ queryKey: keys.custom(r) }))).then(() => undefined),
    [client, keys],
  );
}

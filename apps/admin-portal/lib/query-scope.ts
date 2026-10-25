"use client";

import { useMemo } from "react";
import { useAuth } from "@scrolloop/sdk";
import { ANONYMOUS_PRINCIPAL, PLATFORM_TENANT, type QueryScope } from "@/constants/query-keys";

/** Scope for query keys: tenant slug (or the platform) plus the signed-in principal. */
export function useQueryScope(tenant: string = PLATFORM_TENANT): QueryScope {
  const { user } = useAuth();
  const principal = user?.id ?? ANONYMOUS_PRINCIPAL;
  return useMemo(() => ({ tenant, principal }), [tenant, principal]);
}

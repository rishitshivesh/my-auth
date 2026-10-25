"use client";

import { useMemo } from "react";
import { useAuth } from "@scrolloop/sdk";
import { ANONYMOUS_PRINCIPAL, queryKeys } from "@/constants/query-keys";

/** Query keys scoped to the signed-in tenant and principal so cache never crosses accounts. */
export function useAccountKeys() {
  const { user } = useAuth();
  const tenant = user?.tenantId ?? ANONYMOUS_PRINCIPAL;
  const principal = user?.id ?? ANONYMOUS_PRINCIPAL;
  return useMemo(() => queryKeys({ tenant, principal }).account, [tenant, principal]);
}

export function useAccountEnabled(): boolean {
  return Boolean(useAuth().user?.id);
}

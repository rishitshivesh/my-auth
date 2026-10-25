"use client";

import { useMemo } from "react";
import { useAuth } from "@scrolloop/sdk";
import { ANONYMOUS_PRINCIPAL, queryKeys, type QueryKeys } from "@/constants/query-keys";

/** Query keys scoped to the workspace slug and the signed-in principal. */
export function useScopedKeys(slug: string): QueryKeys {
  const { user } = useAuth();
  const principal = user?.id ?? ANONYMOUS_PRINCIPAL;
  return useMemo(() => queryKeys({ tenant: slug, principal }), [slug, principal]);
}

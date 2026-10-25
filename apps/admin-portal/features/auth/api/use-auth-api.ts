"use client";

import { useMemo } from "react";
import { createAuthApi, type AuthApi } from "./auth-api";
import { currentTenantSlug, getTenantClient } from "./tenant-client";

export interface AuthContextValue {
  tenantSlug: string;
  api: AuthApi;
}

/** Tenant-scoped API for hosted identity, derived from the request host. */
export function useAuthApi(): AuthContextValue {
  return useMemo(() => {
    const host = typeof window === "undefined" ? "" : window.location.host;
    const tenantSlug = currentTenantSlug(host);
    return { tenantSlug, api: createAuthApi(getTenantClient(tenantSlug)) };
  }, []);
}

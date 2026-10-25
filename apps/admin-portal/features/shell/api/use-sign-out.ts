"use client";

import { useCallback } from "react";
import { useAuth } from "@scrolloop/sdk";
import { authRoutes } from "@/constants/routes";
import { getTenantClient } from "@/features/auth/api/tenant-client";

/**
 * Ends the session through the SDK client for the given workspace (the session
 * belongs to that tenant), then performs a full navigation so no signed-in
 * state survives in memory. Without a slug the portal's default client is used.
 */
export function useSignOut(slug?: string): () => void {
  const { logout } = useAuth();
  return useCallback(() => {
    const end = slug ? getTenantClient(slug).logout() : logout();
    void end.catch(() => undefined).finally(() => window.location.assign(authRoutes.login()));
  }, [slug, logout]);
}

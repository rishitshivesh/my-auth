"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@scrolloop/sdk";
import { ANONYMOUS_PRINCIPAL, PLATFORM_TENANT, queryKeys } from "@/constants/query-keys";
import { SEARCH_DEBOUNCE_MS } from "@/constants/limits";
import { authClient } from "@/lib/auth-client";
import { tenantRequest } from "@/lib/tenant-api";
import { withErrorHandler } from "@/lib/with-error-handler";
import { validateSlug, type RegisterBody, type SlugCheckState } from "../model/workspace-form";

export interface WorkspaceMembership {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

/** Memberships of the signed-in person (GET /users/orgs). Disabled until signed in. */
export function useMemberships(enabled: boolean) {
  const { user } = useAuth();
  const keys = queryKeys({ tenant: PLATFORM_TENANT, principal: user?.id ?? ANONYMOUS_PRINCIPAL });
  return useQuery({
    queryKey: keys.workspaces.list(),
    enabled,
    queryFn: withErrorHandler<[], WorkspaceMembership[]>(async () => authClient.getUserOrgs(), { showErrorToast: false }),
  });
}

/** Debounced availability check; never reports "available" for a locally invalid slug. */
export function useSlugCheck(slug: string): { state: SlugCheckState; reason?: string } {
  const [result, setResult] = useState<{ state: SlugCheckState; reason?: string }>({ state: "idle" });
  useEffect(() => {
    if (!slug) { setResult({ state: "idle" }); return; }
    if (validateSlug(slug)) { setResult({ state: "invalid" }); return; }
    setResult({ state: "checking" });
    let cancelled = false;
    const timer = setTimeout(() => {
      tenantRequest<{ available: boolean; reason?: string }>(`/tenants/slug-check?slug=${encodeURIComponent(slug)}`)
        .then((r) => { if (!cancelled) setResult({ state: r.available ? "available" : "taken", reason: r.reason }); })
        .catch(() => { if (!cancelled) setResult({ state: "unknown" }); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug]);
  return result;
}

/** Registration answer: the credentials arrive as httpOnly cookies, never in the body. */
export interface WorkspaceRegistration {
  tenantSlug: string;
  user: { id: string; email: string; name: string };
  expiresIn: number;
}

/**
 * POST /tenants/register creates the workspace AND signs the owner in (cookies). The response only
 * carries the slug and owner details, so the UI can open the workspace without another sign-in.
 */
export function useRegisterWorkspace() {
  return useMutation({
    mutationFn: (body: RegisterBody) => tenantRequest<WorkspaceRegistration>("/tenants/register", "POST", body),
  });
}

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

/**
 * TODO(gap:T04-register-session): POST /tenants/register returns tokens in the body and sets no
 * cookies; the response is discarded, so the owner signs in again after creating a workspace.
 */
export function useRegisterWorkspace() {
  return useMutation({ mutationFn: (body: RegisterBody) => tenantRequest<unknown>("/tenants/register", "POST", body) });
}

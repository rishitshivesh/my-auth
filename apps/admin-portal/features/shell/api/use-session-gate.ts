"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@scrolloop/sdk";
import { authRoutes } from "@/constants/routes";

export type SessionGateStatus = "loading" | "signed-out" | "signed-in";

/**
 * Client-side guard for console surfaces. Signed-out visitors are sent to the
 * hosted login with the page they asked for as the return destination. The
 * backend still authorises every request; this only avoids rendering a shell
 * for someone who has no session.
 */
export function useSessionGate(): SessionGateStatus {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const status: SessionGateStatus = isLoading ? "loading" : isAuthenticated ? "signed-in" : "signed-out";

  useEffect(() => {
    if (status !== "signed-out") return;
    // Read at redirect time: useSearchParams would force every console route to bail out of prerendering.
    router.replace(authRoutes.login({ next: `${pathname}${window.location.search}` }));
  }, [status, router, pathname]);

  return status;
}

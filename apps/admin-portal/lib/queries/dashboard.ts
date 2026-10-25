import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { DashboardData } from "@/lib/types";
import { apiUrl } from "./shared";

// ─── Dashboard ───────────────────────────────────────────────

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: withErrorHandler<[], DashboardData>(
      async () => authClient.request({ url: apiUrl("/dashboard"), method: "GET" })
    ),
  });
}

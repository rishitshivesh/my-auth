import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { ActivityEvent, AuthBreakdown, TenantMetrics, TrendPoint } from "@/lib/types";
import { apiUrl } from "./shared";

export function useTenantMetrics() {
  return useQuery<TenantMetrics>({
    queryKey: ["tenant", "metrics"],
    queryFn: withErrorHandler<[], TenantMetrics>(
      async () => authClient.request({
        url: apiUrl("/dashboard/tenant-metrics"),
        method: "GET",
      })
    ),
  });
}

export function useTenantActivity(limit = 20) {
  return useQuery<ActivityEvent[]>({
    queryKey: ["tenant", "activity", limit],
    queryFn: withErrorHandler<[], ActivityEvent[]>(
      async () => authClient.request({
        url: apiUrl(`/dashboard/tenant-activity?limit=${limit}`),
        method: "GET",
      })
    ),
  });
}

export function useApiCallTrend(days: 7 | 14 | 30 = 7) {
  return useQuery<TrendPoint[]>({
    queryKey: ["tenant", "api-call-trend", days],
    queryFn: withErrorHandler<[], TrendPoint[]>(
      async () => authClient.request({
        url: apiUrl(`/dashboard/api-call-trend?days=${days}`),
        method: "GET",
      })
    ),
  });
}

export function useAuthBreakdown() {
  return useQuery<AuthBreakdown>({
    queryKey: ["tenant", "auth-breakdown"],
    queryFn: withErrorHandler<[], AuthBreakdown>(
      async () => authClient.request({
        url: apiUrl("/dashboard/auth-breakdown"),
        method: "GET",
      })
    ),
  });
}

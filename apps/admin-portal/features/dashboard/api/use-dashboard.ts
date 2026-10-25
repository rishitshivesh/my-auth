"use client";

import { useQuery } from "@tanstack/react-query";
import { useScopedKeys } from "@/features/access/api/use-scope";
import { tenantRequest } from "@/lib/tenant-api";
import type { ActivityEvent, TenantMetrics, TrendPoint } from "@/lib/types";

export const TREND_DAYS = 7;
export const ACTIVITY_LIMIT = 8;

/** Three independent reads so one failing service never blanks the whole overview. */
export function useDashboard(slug: string) {
  const keys = useScopedKeys(slug);
  const metrics = useQuery({ queryKey: keys.tenants.custom("metrics"), queryFn: () => tenantRequest<TenantMetrics>("/dashboard/tenant-metrics") });
  const activity = useQuery({
    queryKey: keys.audit.custom("dashboard-activity", ACTIVITY_LIMIT),
    queryFn: () => tenantRequest<ActivityEvent[]>(`/dashboard/tenant-activity?limit=${ACTIVITY_LIMIT}`),
  });
  const trend = useQuery({
    queryKey: keys.tenants.custom("api-trend", TREND_DAYS),
    queryFn: () => tenantRequest<TrendPoint[]>(`/dashboard/api-call-trend?days=${TREND_DAYS}`),
  });
  return { metrics, activity, trend };
}

import type { ActivityItem } from "./types";

/** The endpoint accepts a limit only (max 100); search and severity filter the loaded rows. */
export const ACTIVITY_LIMITS = [20, 50, 100] as const;
export const DEFAULT_ACTIVITY_LIMIT = 50;
export const SEVERITIES = ["info", "medium", "warning", "high", "critical"] as const;

export function filterActivity(items: readonly ActivityItem[], search: string, severity: string): ActivityItem[] {
  const needle = search.trim().toLowerCase();
  return items.filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (!needle) return true;
    return [item.eventType, item.actorEmail, item.ipAddress, item.tenantId].some((v) => v?.toLowerCase().includes(needle));
  });
}

export function actorLabel(item: Pick<ActivityItem, "actorEmail">, fallback: string): string {
  return item.actorEmail || fallback;
}

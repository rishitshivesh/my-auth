import type { TenantRoutes } from "@/constants/routes";
import type { ActivityEvent, TenantMetrics, TrendPoint } from "@/lib/types";

export type TileId = "users" | "sessions" | "applications" | "mfa";

export interface Tile {
  id: TileId;
  value: string;
}

export function buildTiles(metrics: TenantMetrics, locale = "en"): Tile[] {
  const number = new Intl.NumberFormat(locale);
  const rate = Math.round(Math.min(1, Math.max(0, metrics.mfaAdoptionRate)) * 100);
  return [
    { id: "users", value: number.format(metrics.totalUsers) },
    { id: "sessions", value: number.format(metrics.activeSessions) },
    { id: "applications", value: number.format(metrics.totalApplications) },
    { id: "mfa", value: `${rate}%` },
  ];
}

export interface TrendBar {
  key: string;
  date: string;
  count: number;
  /** Height as a whole percent of the tallest bar (min 2 so zero days stay visible). */
  percent: number;
}

const MIN_BAR_PERCENT = 2;

export function buildTrend(points: readonly TrendPoint[]): TrendBar[] {
  const max = Math.max(0, ...points.map((p) => p.count));
  return points.map((p) => ({
    key: p.date,
    date: p.date,
    count: p.count,
    percent: max === 0 ? MIN_BAR_PERCENT : Math.max(MIN_BAR_PERCENT, Math.round((p.count / max) * 100)),
  }));
}

export type SetupStepId = "application" | "connection" | "mfa";

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
  href: string;
}

/** Guidance derived from real counts and pointing at routes that exist. */
export function setupSteps(metrics: TenantMetrics, routes: TenantRoutes): SetupStep[] {
  return [
    { id: "application", done: metrics.totalApplications > 0, href: routes.applications() },
    { id: "connection", done: metrics.activeApiKeys > 0, href: routes.connections() },
    { id: "mfa", done: metrics.mfaAdoptionRate >= 0.5, href: routes.security() },
  ];
}

export function recentActivity(events: readonly ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

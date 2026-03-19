"use client";

import { PortalLayout } from "@/components/layouts/portal-layout";
import { Skeleton, Button } from "@repo/ui";
import {
  useTenantMetrics,
  useTenantActivity,
  useApiCallTrend,
} from "@/lib/queries";
import { formatDistanceToNow } from "date-fns";
import type { TrendPoint } from "@/lib/types";
import { useParams } from "next/navigation";

// ── Chart helpers ──────────────────────────────────────────────

const CHART_W = 700;
const CHART_H = 200;
const CHART_PADDING = 10;

function computeChartPaths(points: TrendPoint[]): {
  line: string;
  area: string;
} {
  if (points.length === 0) {
    return { line: "", area: "" };
  }

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const n = points.length;

  const coords = points.map((p, i) => {
    const x = n === 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W;
    const y =
      CHART_PADDING + (CHART_H - CHART_PADDING * 2) * (1 - p.count / maxCount);
    return { x, y };
  });

  const lineParts = coords.map(
    (c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)},${c.y.toFixed(1)}`,
  );
  const line = lineParts.join(" ");
  const area =
    line +
    ` L ${coords[coords.length - 1]!.x.toFixed(1)},${CHART_H} L ${coords[0]!.x.toFixed(1)},${CHART_H} Z`;

  return { line, area };
}

// ── Severity colour ────────────────────────────────────────────

function severityClass(severity: string) {
  if (severity === "critical")
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (severity === "warning")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
}

function eventInitial(eventType: string): string {
  return eventType.split(".")[0]?.charAt(0).toUpperCase() ?? "E";
}

// ── Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
  } = useTenantMetrics();

  const params = useParams();

  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError,
  } = useTenantActivity(10);

  const { data: trend, isLoading: trendLoading } = useApiCallTrend(7);

  const { line: trendLine, area: trendArea } = computeChartPaths(trend ?? []);

  const stats = [
    {
      label: "Total Users",
      value: metricsLoading
        ? null
        : (metrics?.totalUsers.toLocaleString() ?? "—"),
      change: null,
    },
    {
      label: "Active Sessions",
      value: metricsLoading
        ? null
        : (metrics?.activeSessions.toLocaleString() ?? "—"),
      change: null,
    },
    {
      label: "Applications",
      value: metricsLoading
        ? null
        : (metrics?.totalApplications.toLocaleString() ?? "—"),
      change: null,
    },
    {
      label: "MFA Adoption",
      value: metricsLoading
        ? null
        : metrics != null
          ? `${Math.round(metrics.mfaAdoptionRate * 100)}%`
          : "—",
      change: null,
    },
  ];

  return (
    <PortalLayout
      tenantSlug={params.slug as string}
      pageTitle="Dashboard"
      pageSubtitle="Overview of your Fort Knox tenant"
      currentPath={`/t/${params.slug}/dashboard`}
    >
      <div className="space-y-8">
        {/* ── Stat cards ── */}
        {metricsError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load metrics. Please refresh the page.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-card p-6"
              >
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                {stat.value === null ? (
                  <Skeleton className="mt-2 h-9 w-24 rounded" />
                ) : (
                  <p className="mt-2 text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── API call trend chart ── */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            API Call Trend (last 7 days)
          </h3>
          {trendLoading ? (
            <Skeleton className="h-[200px] w-full rounded" />
          ) : (
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              className="w-full h-[200px]"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="rgb(99,102,241)"
                    stopOpacity="0.3"
                  />
                  <stop
                    offset="100%"
                    stopColor="rgb(99,102,241)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {trendArea && <path d={trendArea} fill="url(#trendGradient)" />}
              {trendLine && (
                <path
                  d={trendLine}
                  fill="none"
                  stroke="rgb(99,102,241)"
                  strokeWidth="2"
                />
              )}
              {(!trend || trend.every((p) => p.count === 0)) && (
                <text
                  x={CHART_W / 2}
                  y={CHART_H / 2}
                  textAnchor="middle"
                  fontSize="14"
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  No API calls recorded yet
                </text>
              )}
            </svg>
          )}
        </div>

        {/* ── Activity feed + Quick Actions ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              Recent Activity
            </h3>

            {activityError ? (
              <p className="text-sm text-muted-foreground">
                Failed to load activity.
              </p>
            ) : activityLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4 rounded" />
                      <Skeleton className="h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-4">
                {activity.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                      {eventInitial(event.eventType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {event.eventType}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityClass(event.severity)}`}
                        >
                          {event.severity}
                        </span>
                      </div>
                      {event.actorEmail && (
                        <p className="text-xs text-muted-foreground truncate">
                          {event.actorEmail}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.createdAt), {
                          addSuffix: true,
                        })}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent activity.
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <Button
                className="w-full justify-start bg-transparent"
                variant="outline"
              >
                Create new application
              </Button>
              <Button
                className="w-full justify-start bg-transparent"
                variant="outline"
              >
                Manage users
              </Button>
              <Button
                className="w-full justify-start bg-transparent"
                variant="outline"
              >
                Configure security settings
              </Button>
              <Button
                className="w-full justify-start bg-transparent"
                variant="outline"
              >
                View audit logs
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

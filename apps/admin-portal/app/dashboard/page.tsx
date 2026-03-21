'use client'

import { usePlatformMetrics, usePlatformActivity } from '@/lib/admin-queries'
import { formatRelativeTime, formatEventDescription, getEventColor } from '@/lib/utils'
import Link from 'next/link'
import { useAuth } from '@fortknox/sdk'

function MetricSkeleton() {
  return <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
}

export default function SuperAdminDashboard() {
  const { user } = useAuth()
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = usePlatformMetrics()
  const { data: activity, isLoading: activityLoading } = usePlatformActivity(20)

  const statCards = [
    {
      label: 'Total Tenants',
      value: metrics?.totalTenants,
      sub: 'organisations on the platform',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      href: '/tenants',
    },
    {
      label: 'Total Users',
      value: metrics?.totalUsers,
      sub: 'across all tenants',
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      href: '/users',
    },
    {
      label: 'Active Sessions',
      value: metrics?.activeSessions,
      sub: 'live right now',
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      href: null,
    },
    {
      label: 'API Calls Today',
      value: metrics?.apiCallsToday,
      sub: 'requests processed today',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      href: null,
    },
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            FK
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Fort Knox</p>
            <p className="text-xs text-muted-foreground">Superadmin</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { label: 'Dashboard', href: '/dashboard', icon: '⊞' },
            { label: 'Tenants', href: '/tenants', icon: '🏢' },
            { label: 'Users', href: '/users', icon: '👥' },
            { label: 'Audit Logs', href: '/audit-logs', icon: '📋' },
            { label: 'Settings', href: '/settings', icon: '⚙' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                item.href === '/dashboard'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-3">
          <p className="truncate text-xs text-muted-foreground px-3">{user?.email}</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Platform Overview</h1>
            <p className="text-xs text-muted-foreground">Fort Knox operator dashboard</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {metricsError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              Failed to load platform metrics. Please refresh.
            </div>
          ) : null}

          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <div className="mt-2">
                  {metricsLoading ? (
                    <MetricSkeleton />
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xl font-bold ${card.color}`}
                    >
                      {card.value?.toLocaleString() ?? '—'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                {card.href && (
                  <Link
                    href={card.href}
                    className="mt-2 inline-block text-xs text-primary hover:underline"
                  >
                    View all →
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* Activity feed + quick actions */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent activity */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Recent Platform Activity</h2>
                <Link href="/audit-logs" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>

              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-6 w-6 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 10).map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          getEventColor(event.eventType).includes('destructive')
                            ? 'bg-destructive'
                            : getEventColor(event.eventType).includes('amber')
                            ? 'bg-amber-500'
                            : 'bg-primary'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {formatEventDescription(event.eventType)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.actorEmail && `${event.actorEmail} · `}
                          {formatRelativeTime(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              )}
            </div>

            {/* Quick actions */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: 'Create New Tenant', href: '/tenants/new' },
                  { label: 'View All Tenants', href: '/tenants' },
                  { label: 'View Audit Logs', href: '/audit-logs' },
                  { label: 'Platform Settings', href: '/settings' },
                ].map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    {action.label}
                    <span className="text-muted-foreground text-xs">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePlatformActivity } from '@/lib/admin-queries'
import { formatRelativeTime, formatEventDescription, getEventColor } from '@/lib/utils'

export default function AuditLogsPage() {
  const { data: events, isLoading } = usePlatformActivity(100)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">FK</div>
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
                item.href === '/audit-logs'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Audit Logs</h1>
            <p className="text-xs text-muted-foreground">Security events across all tenants</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 rounded bg-muted animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : events?.map((event) => (
                      <tr key={event.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                getEventColor(event.eventType).includes('destructive')
                                  ? 'bg-destructive'
                                  : getEventColor(event.eventType).includes('amber')
                                  ? 'bg-amber-500'
                                  : 'bg-primary'
                              }`}
                            />
                            <span className="font-medium text-foreground">
                              {formatEventDescription(event.eventType)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {event.actorEmail ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {event.ipAddress ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              event.severity === 'critical'
                                ? 'bg-destructive/10 text-destructive'
                                : event.severity === 'high'
                                ? 'bg-amber-500/10 text-amber-700'
                                : event.severity === 'medium'
                                ? 'bg-blue-500/10 text-blue-700'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {event.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatRelativeTime(event.createdAt)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!isLoading && (!events || events.length === 0) && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No audit events recorded yet.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

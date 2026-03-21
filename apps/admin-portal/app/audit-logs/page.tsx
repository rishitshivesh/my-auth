'use client'

import { usePlatformActivity } from '@/lib/admin-queries'
import { formatRelativeTime, formatEventDescription, getEventColor } from '@/lib/utils'
import { withAdmin } from '@/lib/with-admin'
import { AdminSidebar } from '@/components/admin-sidebar'

function AuditLogsPage() {
  const { data: events, isLoading } = usePlatformActivity(100)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar />

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

export default withAdmin(AuditLogsPage)

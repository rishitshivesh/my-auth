'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAdminTenant, useUpdateTenant, useDeleteTenant } from '@/lib/admin-queries'
import type { ActivityEvent } from '@/lib/admin-queries'
import { formatRelativeTime, formatEventDescription } from '@/lib/utils'
import { getErrorMessage } from "@/lib/api-error";

function tenantColor(slug: string): string {
  const colors = [
    'bg-blue-500/10 text-blue-600',
    'bg-amber-500/10 text-amber-600',
    'bg-emerald-500/10 text-emerald-600',
    'bg-purple-500/10 text-purple-600',
    'bg-rose-500/10 text-rose-600',
  ]
  return colors[(slug.charCodeAt(0) ?? 0) % colors.length] ?? colors[0]!
}

const TABS = ['overview', 'users', 'api-keys', 'audit-logs', 'danger-zone'] as const
type Tab = (typeof TABS)[number]

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const router = useRouter()

  const { data: tenant, isLoading, isError } = useAdminTenant(tenantId)
  const { mutate: updateTenant, isPending: isUpdating } = useUpdateTenant(tenantId)
  const { mutate: deleteTenant, isPending: isDeleting } = useDeleteTenant()

  const [tab, setTab] = useState<Tab>('overview')
  const [confirmText, setConfirmText] = useState('')
  const [suspendPhase, setSuspendPhase] = useState<'idle' | 'confirm'>('idle')
  const [suspendTimer, setSuspendTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  // Sync tab with URL hash
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Tab
    if (TABS.includes(hash)) setTab(hash)
  }, [])

  function selectTab(t: Tab) {
    setTab(t)
    window.history.replaceState(null, '', `#${t}`)
  }

  function handleSuspendClick() {
    if (suspendPhase === 'idle') {
      setSuspendPhase('confirm')
      const t = setTimeout(() => setSuspendPhase('idle'), 3000)
      setSuspendTimer(t)
    } else {
      if (suspendTimer) clearTimeout(suspendTimer)
      setSuspendPhase('idle')
      updateTenant(
        { status: tenant?.status === 'active' ? 'suspended' : 'active' },
        { onError: (e) => alert(getErrorMessage(e)) }
      )
    }
  }

  function handleDelete() {
    if (confirmText !== tenant?.slug) return
    deleteTenant(tenantId, {
      onSuccess: () => router.push('/tenants'),
      onError: (e) => alert(getErrorMessage(e)),
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isError || !tenant) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load tenant</p>
          <Link href="/tenants" className="text-sm text-primary hover:underline">← Back to tenants</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">SS</div>
          <div><p className="text-sm font-semibold text-foreground">Scrolloop Sentry</p><p className="text-xs text-muted-foreground">Superadmin</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { label: 'Dashboard', href: '/dashboard', icon: '⊞' },
            { label: 'Tenants', href: '/tenants', icon: '🏢' },
            { label: 'Users', href: '/users', icon: '👥' },
            { label: 'Audit Logs', href: '/audit-logs', icon: '📋' },
            { label: 'Settings', href: '/settings', icon: '⚙' },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${item.href === '/tenants' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <span className="text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-8 py-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
            <Link href="/tenants" className="hover:text-foreground">Tenants</Link>
            <span>/</span>
            <span className="text-foreground font-medium">{tenant.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${tenantColor(tenant.slug)}`}>
              {tenant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{tenant.name}</h1>
              <p className="text-sm text-muted-foreground">{tenant.slug} · {tenant.plan} · {tenant.environment}</p>
            </div>
            <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tenant.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              {tenant.status}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 mt-4 -mb-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => selectTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6 max-w-4xl">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Total Users', value: tenant.userCount.toLocaleString() },
                  { label: 'Active Sessions', value: tenant.activeSessions.toLocaleString() },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-card p-5">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Recent sign-ins */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
                  {tenant.recentActivity.length > 0 ? (
                    <div className="space-y-3">
                      {tenant.recentActivity.map((event: ActivityEvent) => (
                        <div key={event.id} className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                          <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          <div>
                            <p className="text-xs font-medium text-foreground">{formatEventDescription(event.eventType)}</p>
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

                {/* Sidebar info */}
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Info</h2>
                  {[
                    { label: 'Created', value: new Date(tenant.createdAt).toLocaleDateString() },
                    { label: 'Plan', value: tenant.plan },
                    { label: 'Environment', value: tenant.environment },
                    { label: 'Custom Domain', value: tenant.customDomain ?? 'Not configured' },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <p className="text-xs text-muted-foreground">{row.label}</p>
                      <p className="text-sm text-foreground font-medium">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DANGER ZONE */}
          {tab === 'danger-zone' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
                  <p className="mt-1 text-sm text-muted-foreground">These actions are irreversible.</p>
                </div>

                {/* Suspend */}
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {tenant.status === 'active' ? 'Suspend Tenant' : 'Reactivate Tenant'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tenant.status === 'active'
                        ? 'Prevent all users from signing in.'
                        : 'Allow users to sign in again.'}
                    </p>
                  </div>
                  <button
                    onClick={handleSuspendClick}
                    disabled={isUpdating}
                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      suspendPhase === 'confirm'
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        : 'border border-border text-foreground hover:bg-accent'
                    } disabled:opacity-50`}
                  >
                    {isUpdating
                      ? 'Updating…'
                      : suspendPhase === 'confirm'
                      ? 'Click again to confirm'
                      : tenant.status === 'active'
                      ? 'Suspend'
                      : 'Reactivate'}
                  </button>
                </div>

                {/* Delete */}
                <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete Tenant</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Permanently delete <strong>{tenant.name}</strong> and all associated data. This cannot be undone.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Type <strong className="text-foreground">{tenant.slug}</strong> to confirm
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={tenant.slug}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
                    />
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={confirmText !== tenant.slug || isDeleting}
                    className="w-full rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-40"
                  >
                    {isDeleting ? 'Deleting…' : 'Delete Tenant'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PLACEHOLDER TABS */}
          {(tab === 'users' || tab === 'api-keys' || tab === 'audit-logs') && (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              {tab.replace(/-/g, ' ')} — coming soon
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

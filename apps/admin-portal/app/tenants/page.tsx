'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminTenants } from '@/lib/admin-queries'
import type { TenantListItem } from '@/lib/admin-queries'

function tenantColor(slug: string): string {
  const colors = [
    'bg-blue-500/10 text-blue-600',
    'bg-amber-500/10 text-amber-600',
    'bg-emerald-500/10 text-emerald-600',
    'bg-purple-500/10 text-purple-600',
    'bg-rose-500/10 text-rose-600',
  ]
  const index = (slug.charCodeAt(0) ?? 0) % colors.length
  return colors[index] ?? colors[0]!
}

function planBadgeColor(plan: string): string {
  switch (plan?.toLowerCase()) {
    case 'enterprise': return 'bg-purple-500/10 text-purple-700 dark:text-purple-300'
    case 'pro':
    case 'professional': return 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
    default: return 'bg-muted text-muted-foreground'
  }
}

function AdminSidebar({ current }: { current: string }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">FK</div>
        <div><p className="text-sm font-semibold text-foreground">Fort Knox</p><p className="text-xs text-muted-foreground">Superadmin</p></div>
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
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${item.href === current ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
            <span className="text-base">{item.icon}</span>{item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

export default function TenantsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [planFilter, setPlanFilter] = useState(searchParams.get('plan') ?? '')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useAdminTenants({
    search: search || undefined,
    status: statusFilter || undefined,
    plan: planFilter || undefined,
    page,
    limit: 20,
  })

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar current="/tenants" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Tenants</h1>
            {data && (
              <p className="text-xs text-muted-foreground">{data.total} tenant{data.total !== 1 ? 's' : ''} total</p>
            )}
          </div>
          <Link
            href="/tenants/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Tenant
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name or slug…"
              className="flex-1 min-w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
              <option value="professional">Professional</option>
            </select>
          </div>

          {/* Table */}
          {isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load tenants. Please refresh.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Users</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 rounded bg-muted animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : data?.tenants.map((tenant: TenantListItem) => (
                        <tr
                          key={tenant.id}
                          onClick={() => router.push(`/tenants/${tenant.id}`)}
                          className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tenantColor(tenant.slug)}`}>
                                {tenant.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{tenant.name}</p>
                                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeColor(tenant.plan)}`}>
                              {tenant.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{tenant.userCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(tenant.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tenant.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                              {tenant.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

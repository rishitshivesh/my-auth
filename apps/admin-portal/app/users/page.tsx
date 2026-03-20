'use client'

import Link from 'next/link'

export default function UsersPage() {
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
                item.href === '/users'
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
            <h1 className="text-lg font-semibold text-foreground">Users</h1>
            <p className="text-xs text-muted-foreground">All users across all tenants</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Cross-tenant user management — coming soon</p>
        </main>
      </div>
    </div>
  )
}

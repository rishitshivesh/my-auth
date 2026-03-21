'use client'

import Link from 'next/link'
import { usePathname, useParams, useRouter } from 'next/navigation'
import { useAuth } from '@fortknox/sdk'
import {
  LayoutDashboard,
  Grid3X3,
  Users,
  FileText,
  CreditCard,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react'

export function TenantSidebar() {
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()
  const { user, logout } = useAuth()

  const slug = (params?.slug as string) ?? ''

  const navGroups = [
    {
      label: 'Home',
      items: [
        { label: 'Dashboard', href: `/t/${slug}/dashboard`, icon: LayoutDashboard },
        { label: 'Applications', href: `/t/${slug}/applications`, icon: Grid3X3 },
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'Team', href: `/t/${slug}/team`, icon: Users },
        { label: 'Billing', href: `/t/${slug}/billing`, icon: CreditCard },
        { label: 'Audit Log', href: `/t/${slug}/audit-logs`, icon: FileText },
        { label: 'Settings', href: `/t/${slug}/settings`, icon: Settings },
      ],
    },
  ]

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'

  async function handleLogout() {
    await logout()
    router.push('/u/login')
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{slug}</p>
          <p className="text-xs text-muted-foreground">Tenant Portal</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </div>
          <p className="flex-1 truncate text-xs text-muted-foreground">
            {user?.email ?? ''}
          </p>
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

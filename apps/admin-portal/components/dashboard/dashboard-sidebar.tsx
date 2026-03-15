"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@fortknox/sdk"
import {
  LayoutDashboard,
  AppWindow,
  Shield,
  User,
  Settings,
  LogOut,
  ChevronRight,
  Lock,
} from "lucide-react"

const navItems = [
  { label: "Overview",      href: "/dashboard",              icon: LayoutDashboard },
  { label: "Applications",  href: "/dashboard/applications", icon: AppWindow },
  { label: "Security",      href: "/dashboard/security",     icon: Shield },
  { label: "Profile",       href: "/dashboard/profile",      icon: User },
  { label: "Settings",      href: "/dashboard/settings",     icon: Settings },
]

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Lock className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Fort Knox</p>
          <p className="text-xs text-muted-foreground">Admin Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold">
            {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.firstName
                ? `${user.firstName} ${user.lastName ?? ""}`.trim()
                : user?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
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

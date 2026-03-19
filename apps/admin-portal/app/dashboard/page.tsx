"use client"

import { useAuth } from "@fortknox/sdk"
import { Skeleton } from "@repo/ui"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { useDashboard } from "@/lib/queries"
import { ShieldAlert, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

export default function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, isError } = useDashboard()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {user?.firstName ? `Welcome back, ${user.firstName}` : "Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data?.stats?.lastLoginAt
                ? `Last login ${formatDistanceToNow(new Date(data.stats.lastLoginAt), { addSuffix: true })}`
                : "Fort Knox Admin Portal"}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              Failed to load dashboard data. Please refresh the page.
            </div>
          ) : isLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-16 w-full rounded-xl" />
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </div>
          ) : (
            <>
              {/* MFA Banner */}
              {data?.mfa?.enabled ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-5 py-4">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                    Your account is protected with multi-factor authentication.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-5 py-4">
                  <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Multi-factor authentication is not enabled
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                      MFA is required to secure your account.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/security"
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                  >
                    Enable MFA
                  </Link>
                </div>
              )}

              {/* Stats cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Active Sessions",
                    value: String(data?.stats?.activeSessions ?? 0),
                    sub: "across all devices",
                    color: "bg-blue-500/10 text-blue-600",
                  },
                  {
                    label: "MFA Status",
                    value: data?.mfa?.enabled ? "Enabled" : "Disabled",
                    sub: data?.mfa?.enabled ? "Account is secured" : "Action required",
                    color: data?.mfa?.enabled
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-red-500/10 text-red-600",
                  },
                  {
                    label: "Auth Method",
                    value: data?.user?.primaryAuthMethod ?? "password",
                    sub: "Primary sign-in method",
                    color: "bg-purple-500/10 text-purple-600",
                  },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-card p-5">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${card.color}`}>
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Details + Quick Actions */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Account Details</h2>
                  <div className="space-y-3">
                    {[
                      { label: "Email", value: data?.user?.email },
                      {
                        label: "Name",
                        value:
                          [data?.user?.firstName, data?.user?.lastName].filter(Boolean).join(" ") ||
                          "—",
                      },
                      { label: "Email Verified", value: data?.user?.emailVerified ? "Yes" : "No" },
                      {
                        label: "Member Since",
                        value: data?.user?.createdAt
                          ? new Date(data.user.createdAt).toLocaleDateString()
                          : "—",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
                  <div className="space-y-2">
                    {[
                      {
                        label: "Set up MFA",
                        href: "/dashboard/security",
                        highlight: !data?.mfa?.enabled,
                      },
                      { label: "Create an Application", href: "/dashboard/applications" },
                      { label: "Edit Profile", href: "/dashboard/profile" },
                    ].map((action) => (
                      <Link
                        key={action.label}
                        href={action.href}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                          action.highlight
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "border-border text-foreground hover:bg-accent"
                        }`}
                      >
                        {action.label}
                        <span className="text-muted-foreground text-xs">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

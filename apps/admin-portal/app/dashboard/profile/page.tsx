"use client"

import { useAuth } from "@scrolloop/sdk"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { Badge } from "@repo/ui"

export default function ProfilePage() {
  const { user } = useAuth()

  const fields = [
    { label: "First Name",     value: user?.firstName || "—" },
    { label: "Last Name",      value: user?.lastName || "—" },
    { label: "Email",          value: user?.email || "—" },
    { label: "Display Name",   value: user?.displayName || "—" },
    { label: "Auth Method",    value: user?.primaryAuthMethod || "password" },
    { label: "Account Status", value: user?.status || "active" },
    {
      label: "Member Since",
      value: user?.createdAt
        ? new Date(user.createdAt as any).toLocaleDateString()
        : "—",
    },
    {
      label: "Last Login",
      value: user?.lastLoginAt
        ? new Date(user.lastLoginAt as any).toLocaleString()
        : "—",
    },
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Profile</h1>
            <p className="text-xs text-muted-foreground">Your account information</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Avatar header */}
              <div className="flex items-center gap-4 border-b border-border p-6 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary text-2xl font-semibold">
                  {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {user?.firstName
                      ? `${user.firstName} ${user.lastName ?? ""}`.trim()
                      : user?.email}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={user?.emailVerified ? "default" : "secondary"}>
                      {user?.emailVerified ? "Email Verified" : "Unverified"}
                    </Badge>
                    <Badge variant="outline">{user?.status ?? "active"}</Badge>
                  </div>
                </div>
              </div>

              {/* Field rows */}
              <div className="divide-y divide-border">
                {fields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-center justify-between px-6 py-4 text-sm"
                  >
                    <span className="text-muted-foreground font-medium w-36">
                      {field.label}
                    </span>
                    <span className="text-foreground font-medium text-right">
                      {field.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

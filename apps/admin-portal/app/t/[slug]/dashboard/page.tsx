"use client"

import { PortalLayout } from "@/components/layouts/portal-layout"
import { Button } from "@/components/ui/button"

export default function DashboardPage({ params }: { params: { slug: string } }) {
  const mockStats = [
    { label: "Total Users", value: "2,458", change: "+12.5%" },
    { label: "Active Sessions", value: "1,203", change: "-2.3%" },
    { label: "Applications", value: "12", change: "+1" },
    { label: "MFA Enabled", value: "78%", change: "+5.2%" },
  ]

  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Dashboard"
      pageSubtitle="Overview of your Fort Knox tenant"
      currentPath={`/t/${params.slug}/dashboard`}
    >
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-4">
          {mockStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {stat.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">Recent Activity</h3>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                    U
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">User registered</p>
                    <p className="text-xs text-muted-foreground">2 hours ago</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">Quick Actions</h3>
            <div className="space-y-2">
              <Button className="w-full justify-start bg-transparent" variant="outline">
                Create new application
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                Manage users
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                Configure security settings
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                View audit logs
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  )
}

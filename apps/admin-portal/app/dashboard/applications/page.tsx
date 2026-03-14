"use client"

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { Button } from "@repo/ui"
import { AppWindow, Plus } from "lucide-react"

export default function ApplicationsPage() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Applications</h1>
            <p className="text-xs text-muted-foreground">Manage your OAuth applications</p>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create Application
          </Button>
        </header>

        <main className="flex flex-1 items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="rounded-full bg-muted p-4">
              <AppWindow className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No applications yet</h2>
            <p className="text-sm text-muted-foreground">
              Create your first application to integrate Fort Knox authentication into your product.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Create Application
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}

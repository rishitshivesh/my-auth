'use client'

import { withAdmin } from '@/lib/with-admin'
import { AdminSidebar } from '@/components/admin-sidebar'

function UsersPage() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar />

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

export default withAdmin(UsersPage)

"use client"

import { PortalLayout } from "@/components/layouts/portal-layout"
import { ApplicationsTable } from "@/components/portal/applications-table"

export default function ApplicationsPage({ params }: { params: { slug: string } }) {
  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Applications"
      pageSubtitle="Manage your integrated applications"
      currentPath={`/t/${params.slug}/applications`}
      primaryAction={{ label: "Create Application", onClick: () => {} }}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Your Applications</h3>
          <ApplicationsTable />
        </div>
      </div>
    </PortalLayout>
  )
}

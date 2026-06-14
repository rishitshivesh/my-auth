"use client"

import { PortalLayout } from "@/components/layouts/portal-layout"
import { ConnectionsList } from "@/components/portal/connections-list"

export default function ConnectionsPage({ params }: { params: { slug: string } }) {
  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Connections"
      pageSubtitle="Manage identity providers and integrations"
      currentPath={`/t/${params.slug}/connections`}
      primaryAction={{ label: "Add Connection", onClick: () => {} }}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Available Connections</h3>
          <ConnectionsList />
        </div>
      </div>
    </PortalLayout>
  )
}

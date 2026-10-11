"use client"

import { useState } from "react"
import { PortalLayout } from "@/components/layouts/portal-layout"
import { ApplicationsTable } from "@/components/portal/applications-table"
import { CreateApplicationModal } from "@/components/portal/create-application-modal"
import { useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"

export default function ApplicationsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="Applications"
      pageSubtitle="Manage your integrated applications"
      currentPath={`/t/${slug}/applications`}
      primaryAction={{ label: "Create Application", onClick: () => setShowCreate(true) }}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Your Applications</h3>
          <ApplicationsTable onCreateClick={() => setShowCreate(true)} />
        </div>
      </div>

      {showCreate && (
        <CreateApplicationModal
          tenantSlug={slug}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ["tenant", "clients"] })
            setShowCreate(false)
          }}
        />
      )}
    </PortalLayout>
  )
}

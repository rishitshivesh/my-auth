"use client"

import type React from "react"

import { useState } from "react"
import { Sidebar } from "../../components/portal/sidebar"
import { Topbar } from "../../components/portal/topbar"

interface PortalLayoutProps {
  children: React.ReactNode
  tenantSlug: string
  tenantName?: string
  logoUrl?: string
  currentPath?: string
  pageTitle?: string
  pageSubtitle?: string
  primaryAction?: {
    label: string
    onClick: () => void
  }
  secondaryActions?: Array<{
    label: string
    onClick: () => void
  }>
}

export function PortalLayout({
  children,
  tenantSlug,
  tenantName = "Fort Knox",
  logoUrl,
  currentPath = "/",
  pageTitle = "Dashboard",
  pageSubtitle,
  primaryAction,
  secondaryActions,
}: PortalLayoutProps) {
  const [currentTenant, setCurrentTenant] = useState(tenantSlug)

  // Mock tenant list
  const tenants = [
    { id: "acme-corp", name: "Acme Corp" },
    { id: "tech-startup", name: "Tech Startup" },
    { id: "enterprise-co", name: "Enterprise Co" },
  ]

  const sidebarItems = [
    {
      label: "Dashboard",
      href: `/t/${tenantSlug}/dashboard`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m-9 4h18"
          />
        </svg>
      ),
    },
    {
      label: "Applications",
      href: `/t/${tenantSlug}/applications`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
          />
        </svg>
      ),
      badge: 3,
    },
    {
      label: "Connections",
      href: `/t/${tenantSlug}/connections`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.658 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      ),
    },
    {
      label: "Branding",
      href: `/t/${tenantSlug}/branding`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      ),
    },
    {
      label: "Security",
      href: `/t/${tenantSlug}/security`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
    },
    {
      label: "Settings",
      href: `/t/${tenantSlug}/settings`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar items={sidebarItems} currentPath={currentPath} tenantName={tenantName} logoUrl={logoUrl} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={pageTitle}
          subtitle={pageSubtitle}
          primaryAction={primaryAction}
          secondaryActions={secondaryActions}
        />

        <div className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"

interface Tenant {
  id: string
  name: string
  logo?: string
}

interface TenantSwitcherProps {
  tenants: Tenant[]
  current?: string
  onTenantChange?: (tenantId: string) => void
}

export function TenantSwitcher({ tenants, current, onTenantChange }: TenantSwitcherProps) {
  const [open, setOpen] = useState(false)
  const currentTenant = tenants.find((t) => t.id === current) || tenants[0]

  return (
    <div className="relative inline-block w-full">
      <Button variant="outline" className="w-full justify-between bg-transparent" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
            {currentTenant?.name.charAt(0)}
          </div>
          {currentTenant?.name}
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </Button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 border border-border rounded-lg bg-card shadow-lg z-50">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => {
                onTenantChange?.(tenant.id)
                setOpen(false)
              }}
              className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                current === tenant.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"
              } border-b border-border last:border-0`}
            >
              <span className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                  {tenant.name.charAt(0)}
                </div>
                {tenant.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

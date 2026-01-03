"use client"

import { StatusBadge } from "../../components/portal/status-badge"
import { Button, Input, Label } from "@repo/ui"

interface Connection {
  id: string
  name: string
  type: string
  status: "active" | "inactive" | "error"
  lastSync: string
}

interface ConnectionsListProps {
  connections?: Connection[]
}

export function ConnectionsList({
  connections = [
    { id: "1", name: "Google OAuth", type: "oauth", status: "active", lastSync: "2025-01-20 14:30" },
    { id: "2", name: "GitHub", type: "oauth", status: "active", lastSync: "2025-01-20 14:25" },
    { id: "3", name: "Microsoft Entra", type: "saml", status: "inactive", lastSync: "2025-01-15 10:00" },
    { id: "4", name: "Okta", type: "saml", status: "error", lastSync: "2025-01-19 09:15" },
  ],
}: ConnectionsListProps) {
  return (
    <div className="space-y-3">
      {connections.map((conn) => (
        <div key={conn.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              {conn.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <h3 className="font-medium text-foreground">{conn.name}</h3>
              <div className="flex gap-3">
                <span className="text-xs text-muted-foreground capitalize">{conn.type}</span>
                <span className="text-xs text-muted-foreground">Last sync: {conn.lastSync}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={conn.status} />
            <Button variant="ghost" size="sm">
              Configure
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

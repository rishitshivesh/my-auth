"use client"

import { StatusBadge } from "../../components/portal/status-badge"
import { Button, Input, Label } from "@repo/ui"


interface Application {
  id: string
  name: string
  clientId: string
  status: "active" | "inactive"
  createdAt: string
  users: number
}

interface ApplicationsTableProps {
  applications?: Application[]
}

export function ApplicationsTable({
  applications = [
    {
      id: "1",
      name: "Mobile App",
      clientId: "clnt_a1b2c3d4e5f6g7h8",
      status: "active",
      createdAt: "2025-01-15",
      users: 1250,
    },
    {
      id: "2",
      name: "Web Dashboard",
      clientId: "clnt_i9j8k7l6m5n4o3p2",
      status: "active",
      createdAt: "2025-01-10",
      users: 450,
    },
    {
      id: "3",
      name: "Legacy System",
      clientId: "clnt_q1w2e3r4t5y6u7i8",
      status: "inactive",
      createdAt: "2024-12-20",
      users: 0,
    },
  ],
}: ApplicationsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Name</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Client ID</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Users</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Created</th>
            <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((app) => (
            <tr key={app.id} className="hover:bg-card/50 transition-colors">
              <td className="px-6 py-4 text-sm font-medium text-foreground">{app.name}</td>
              <td className="px-6 py-4 text-sm text-muted-foreground font-mono text-xs">{app.clientId}</td>
              <td className="px-6 py-4 text-sm">
                <StatusBadge status={app.status} />
              </td>
              <td className="px-6 py-4 text-sm text-foreground">{app.users.toLocaleString()}</td>
              <td className="px-6 py-4 text-sm text-muted-foreground">{app.createdAt}</td>
              <td className="px-6 py-4 text-right">
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

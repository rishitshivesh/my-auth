"use client"

import {
  useTenantClients,
  useDeleteTenantClient,
  useRotateClientSecret,
} from "@/lib/queries"
import type { Client } from "@/lib/types"
import { useState } from "react"
import { Button } from "@repo/ui"
import { StatusBadge } from "./status-badge"
import { format } from "date-fns"
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"

interface ApplicationsTableProps {
  onCreateClick: () => void
}

export function ApplicationsTable({ onCreateClick }: ApplicationsTableProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null)
  const [deleteInput, setDeleteInput] = useState("")
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null)

  const { data: clients, isLoading, error } = useTenantClients()

  const rotateMutation = useRotateClientSecret()

  const deleteMutation = useDeleteTenantClient()

  function handleRotate(client: Client) {
    rotateMutation.mutate(client.id, {
      onSuccess: (data) => {
        setRevealedSecret({ id: client.id, secret: data.clientSecret })
      },
    })
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return
    deleteMutation.mutate(deleteConfirm.id, {
      onSuccess: () => {
        setDeleteConfirm(null)
        setDeleteInput("")
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading applications...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-sm text-destructive">
        Failed to load applications. Please refresh.
      </div>
    )
  }

  const clientList: Client[] = clients ?? []

  if (clientList.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground mb-4">No applications yet.</p>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="w-4 h-4 mr-1" /> Create Application
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Client ID</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Created</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clientList.map((client) => (
              <tr key={client.id} className="border-b border-border last:border-0">
                <td className="px-6 py-4 text-sm font-medium text-foreground">{client.name}</td>
                <td className="px-6 py-4">
                  <code className="text-xs font-mono text-muted-foreground bg-black/5 px-1.5 py-0.5 rounded">
                    {client.clientId}
                  </code>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground capitalize">
                  {client.clientType}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge
                    status={client.isActive ? "active" : "inactive"}
                    label={client.isActive ? "Active" : "Inactive"}
                  />
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {format(new Date(client.createdAt), "MMM dd, yyyy")}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {client.clientType === "confidential" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRotate(client)}
                        disabled={rotateMutation.isPending}
                        title="Rotate secret"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(client)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revealed secret dialog */}
      {revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-foreground mb-2">New Client Secret</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This secret will never be shown again. Copy it now.
            </p>
            <code className="block text-xs font-mono bg-black/5 rounded p-3 break-all mb-4">
              {revealedSecret.secret}
            </code>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => navigator.clipboard.writeText(revealedSecret.secret)}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealedSecret(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-foreground mb-2">Delete Application</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Type <strong>{deleteConfirm.name}</strong> to confirm deletion.
            </p>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 bg-transparent"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={deleteConfirm.name}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteInput !== deleteConfirm.name || deleteMutation.isPending}
                onClick={handleDeleteConfirm}
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setDeleteConfirm(null); setDeleteInput("") }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

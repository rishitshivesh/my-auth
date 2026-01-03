"use client"

import type React from "react"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"


interface CreateTenantFormProps {
  onSubmit?: (data: TenantData) => void
}

interface TenantData {
  name: string
  slug: string
  description: string
}

export function CreateTenantForm({ onSubmit }: CreateTenantFormProps) {
  const [formData, setFormData] = useState<TenantData>({
    name: "",
    slug: "",
    description: "",
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(formData)
      }
    } finally {
      setLoading(false)
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Tenant name</Label>
        <Input
          id="name"
          type="text"
          placeholder="My Company"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">This is your organization's display name</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Tenant slug</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">https://app.fortknox.io/</span>
          <Input
            id="slug"
            type="text"
            placeholder="my-company"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            required
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">Used in your tenant URL</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          placeholder="What does your organization do?"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder-muted-foreground"
          rows={4}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading || !formData.name}>
        {loading ? "Creating tenant..." : "Create tenant"}
      </Button>
    </form>
  )
}

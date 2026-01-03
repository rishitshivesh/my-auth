"use client"

import { PortalLayout } from "@/components/layouts/portal-layout"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function BrandingPage({ params }: { params: { slug: string } }) {
  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Branding"
      pageSubtitle="Customize the look and feel of your auth screens"
      currentPath={`/t/${params.slug}/branding`}
      primaryAction={{ label: "Save Changes", onClick: () => console.log("Save branding") }}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold text-foreground">Logo & Colors</h3>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logo">Logo URL</Label>
              <Input id="logo" placeholder="https://example.com/logo.png" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="primary">Primary Color</Label>
              <div className="flex gap-2">
                <Input id="primary" type="color" defaultValue="#6366f1" className="h-10 w-20" />
                <Input placeholder="#6366f1" defaultValue="#6366f1" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="background">Background</Label>
              <Input id="background" placeholder="URL or color" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fontUrl">Custom Font URL</Label>
              <Input id="fontUrl" placeholder="https://fonts.googleapis.com/..." />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Preview</h3>
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-background">
            <div className="text-center">
              <p className="mb-2 text-sm text-muted-foreground">Login page preview</p>
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold mx-auto">
                FK
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  )
}

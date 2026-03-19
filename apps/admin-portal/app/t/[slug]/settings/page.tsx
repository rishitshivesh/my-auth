"use client";

import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui";
import { Input } from "@repo/ui";
import { Label } from "@repo/ui";

export default function SettingsPage({ params }: { params: { slug: string } }) {
  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Settings"
      pageSubtitle="Manage your tenant settings"
      currentPath={`/t/${params.slug}/settings`}
      primaryAction={{
        label: "Save Changes",
        onClick: () => console.log("Save settings"),
      }}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold text-foreground">
            Tenant Information
          </h3>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Tenant Name</Label>
              <Input id="name" defaultValue="Acme Corporation" />
            </div>

            <div>
              <Label htmlFor="slug">Tenant Slug</Label>
              <Input id="slug" defaultValue={params.slug} disabled />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                defaultValue="Enterprise authentication platform"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground"
                rows={4}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold text-foreground">
            Danger Zone
          </h3>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start border-destructive text-destructive hover:bg-destructive/10 bg-transparent"
            >
              Delete Tenant
            </Button>
            <p className="text-xs text-muted-foreground">
              Once you delete your tenant, there is no going back. Please be
              certain.
            </p>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

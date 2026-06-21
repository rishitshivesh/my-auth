"use client";

import * as React from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { useSamlSPs, useCreateSamlSP, useDeleteSamlSP } from "@/lib/queries";
import type { SamlServiceProvider } from "@/lib/types";
import { Shield, Plus, MoreHorizontal, Trash2, ExternalLink, Copy } from "lucide-react";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function SamlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const { data: sps, isLoading } = useSamlSPs();
  const createSP = useCreateSamlSP();
  const deleteSP = useDeleteSamlSP();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [acsUrl, setAcsUrl] = React.useState("");
  const [sloUrl, setSloUrl] = React.useState("");
  const [certificate, setCertificate] = React.useState("");
  const [metadataUrl, setMetadataUrl] = React.useState("");

  const idpMetadataUrl = `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000"}/saml/metadata/${slug}`;

  async function handleCreate() {
    if (!name || !entityId || !acsUrl) return;
    await createSP.mutateAsync({
      name,
      entityId,
      acsUrl,
      sloUrl: sloUrl || undefined,
      certificate: certificate || undefined,
      metadataUrl: metadataUrl || undefined,
    });
    setIsCreateOpen(false);
    setName(""); setEntityId(""); setAcsUrl(""); setSloUrl(""); setCertificate(""); setMetadataUrl("");
  }

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="SAML Service Providers"
      pageSubtitle="Configure applications that use this tenant as a SAML 2.0 identity provider"
      currentPath={`/t/${slug}/connections/saml`}
      primaryAction={{ label: "Add Service Provider", onClick: () => setIsCreateOpen(true) }}
    >
      <div className="space-y-6">
        {/* IdP Info card */}
        <div className="rounded-2xl bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/20 px-6 py-4 space-y-3">
          <p className="text-sm font-medium text-[var(--color-accent-dark)]">Your IdP Metadata URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-white/60 px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] break-all">
              {idpMetadataUrl}
            </code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(idpMetadataUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={idpMetadataUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Provide this URL to your service providers to automatically configure SSO.
          </p>
        </div>

        {/* SP List */}
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : !sps?.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--color-surface-1)] py-16 text-center backdrop-blur-sm">
            <Shield className="h-10 w-10 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)]">No service providers registered.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]">
              <Plus className="mr-2 h-4 w-4" /> Add Service Provider
            </Button>
          </div>
        ) : (
          sps.map((sp: SamlServiceProvider) => (
            <div key={sp.id} className="rounded-2xl bg-[var(--color-surface-1)] backdrop-blur-sm border border-white/20 px-6 py-4">
              <div className="flex items-start gap-4">
                <Shield className="h-5 w-5 mt-0.5 shrink-0 text-[var(--color-accent)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--color-text-primary)]">{sp.name}</p>
                    <Badge variant={sp.active ? "default" : "secondary"} className={sp.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}>
                      {sp.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)] truncate">{sp.entityId}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                    <span><span className="text-[var(--color-text-tertiary)]">ACS:</span> {sp.acsUrl}</span>
                    {sp.sloUrl && <span><span className="text-[var(--color-text-tertiary)]">SLO:</span> {sp.sloUrl}</span>}
                    <span><span className="text-[var(--color-text-tertiary)]">NameID:</span> {sp.nameIdFormat.split(":").pop()}</span>
                    <span><span className="text-[var(--color-text-tertiary)]">Sign assertions:</span> {sp.signAssertions ? "Yes" : "No"}</span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => deleteSP.mutate(sp.id)}
                      className="text-[var(--color-danger)]"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register Service Provider</DialogTitle>
            <DialogDescription>
              Configure an application that will use this tenant as its SAML IdP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input placeholder="Salesforce" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>IdP Metadata URL (optional)</Label>
              <Input
                placeholder="https://sp.example.com/saml/metadata"
                value={metadataUrl}
                onChange={(e) => setMetadataUrl(e.target.value)}
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">If provided, entity ID and ACS URL can be omitted.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Entity ID (SP Issuer)</Label>
              <Input placeholder="https://sp.example.com" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Assertion Consumer Service URL</Label>
              <Input placeholder="https://sp.example.com/saml/acs" value={acsUrl} onChange={(e) => setAcsUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Single Logout URL (optional)</Label>
              <Input placeholder="https://sp.example.com/saml/slo" value={sloUrl} onChange={(e) => setSloUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SP Certificate (optional)</Label>
              <Textarea
                placeholder="-----BEGIN CERTIFICATE-----"
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                className="font-mono text-xs h-24 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={(!name || !entityId || !acsUrl) && !metadataUrl || createSP.isPending}
              className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
            >
              {createSP.isPending ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}

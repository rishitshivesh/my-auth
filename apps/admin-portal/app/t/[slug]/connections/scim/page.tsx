"use client";

import * as React from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
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
import { useScimTokens, useCreateScimToken, useRevokeScimToken } from "@/lib/queries";
import type { ScimToken } from "@/lib/types";
import { Users, Plus, MoreHorizontal, Trash2, Copy, Key } from "lucide-react";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ScimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const { data: tokens, isLoading } = useScimTokens();
  const createToken = useCreateScimToken();
  const revokeToken = useRevokeScimToken();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [tokenName, setTokenName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [newToken, setNewToken] = React.useState<string | null>(null);

  const scimBaseUrl = `${process.env.NEXT_PUBLIC_AUTH_URL ?? ""}/scim/v2`;

  async function handleCreate() {
    if (!tokenName) return;
    const result = await createToken.mutateAsync({
      name: tokenName,
      expiresAt: expiresAt || undefined,
    });
    setIsCreateOpen(false);
    setTokenName("");
    setExpiresAt("");
    setNewToken(result.token);
  }

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="SCIM Provisioning"
      pageSubtitle="Automate user provisioning from your identity provider"
      currentPath={`/t/${slug}/connections/scim`}
      primaryAction={{ label: "Create Token", onClick: () => setIsCreateOpen(true) }}
    >
      <div className="space-y-6">
        {/* SCIM endpoint info */}
        <div className="rounded-2xl bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/20 px-6 py-4 space-y-3">
          <p className="text-sm font-medium text-[var(--color-accent-dark)]">SCIM 2.0 Base URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-white/60 px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] break-all">
              {scimBaseUrl}
            </code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(scimBaseUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Configure this URL in Okta, Azure AD, or any SCIM-compatible identity provider. Use a bearer token below.
          </p>
        </div>

        {/* Tokens */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Bearer Tokens</h3>
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl mb-3" />)
          ) : !tokens?.length ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--color-surface-1)] py-12 text-center backdrop-blur-sm">
              <Key className="h-8 w-8 text-[var(--color-text-tertiary)]" />
              <p className="text-[var(--color-text-secondary)]">No SCIM tokens yet.</p>
              <Button onClick={() => setIsCreateOpen(true)} className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]">
                <Plus className="mr-2 h-4 w-4" /> Create Token
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((token: ScimToken) => (
                <div
                  key={token.id}
                  className="flex items-center gap-4 rounded-2xl bg-[var(--color-surface-1)] backdrop-blur-sm border border-white/20 px-6 py-4"
                >
                  <Key className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)]" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text-primary)]">{token.name}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                      <span>Created {formatDate(token.createdAt)}</span>
                      {token.lastUsedAt && <span>Last used {formatDate(token.lastUsedAt)}</span>}
                      {token.expiresAt && <span>Expires {formatDate(token.expiresAt)}</span>}
                    </div>
                  </div>
                  <Badge
                    variant={token.active ? "default" : "secondary"}
                    className={token.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}
                  >
                    {token.active ? "Active" : "Revoked"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => revokeToken.mutate(token.id)}
                        className="text-[var(--color-danger)]"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Protocol support */}
        <div className="rounded-2xl bg-[var(--color-surface-1)] backdrop-blur-sm border border-white/20 px-6 py-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">Supported Operations</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-[var(--color-text-secondary)]">
            {[
              "User create / update / delete",
              "Group create / update / delete",
              "Group member add / remove",
              "Filter by userName, email",
              "PATCH operations (RFC 7644)",
              "ServiceProviderConfig",
            ].map((op) => (
              <div key={op} className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <span>{op}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Token Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create SCIM Token</DialogTitle>
            <DialogDescription>This token authorizes your IdP to call the SCIM API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Token Name</Label>
              <Input placeholder="Okta provisioning" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires At (optional)</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!tokenName || createToken.isPending}
              className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
            >
              {createToken.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Token Display Dialog */}
      <Dialog open={!!newToken} onOpenChange={() => setNewToken(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SCIM Bearer Token</DialogTitle>
            <DialogDescription>Copy this now — it won't be shown again.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-2)] px-4 py-3">
            <code className="flex-1 font-mono text-xs break-all text-[var(--color-text-primary)]">{newToken}</code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(newToken ?? "")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}

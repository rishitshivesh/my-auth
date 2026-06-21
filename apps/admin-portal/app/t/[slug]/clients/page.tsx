'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import {
  GlassCard,
  PageHeader,
  SentryButton,
  TokenDisplay,
  StatusBadge,
  SentrySkeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Checkbox,
  SentryInput
} from "@repo/ui";

import {
  useTenantClients,
  useCreateTenantClient,
  useUpdateTenantClient,
  useDeleteTenantClient,
  useRotateClientSecret
} from '@/lib/queries';
import { Plus, AppWindow, Globe, Monitor, MoreHorizontal, Settings, Trash2, Key, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from "@repo/ui/lib/utils";
import type { Client } from '@/lib/types';

export default function ClientsPage() {
  const { data: clients, isLoading } = useTenantClients();

  // Create Client Modal State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createType, setCreateType] = React.useState<'confidential' | 'public'>('confidential');
  const [createRedirectUris, setCreateRedirectUris] = React.useState('');
  const [createGrantTypes, setCreateGrantTypes] = React.useState<string[]>(['authorization_code', 'refresh_token']);
  const [createdClient, setCreatedClient] = React.useState<(Client & { clientSecret: string }) | null>(null);

  // Configure Client Modal State
  const [editingClient, setEditingClient] = React.useState<Client | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editRedirectUris, setEditRedirectUris] = React.useState('');
  const [editGrantTypes, setEditGrantTypes] = React.useState<string[]>([]);
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [rotatedSecret, setRotatedSecret] = React.useState<string | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);

  const createClient = useCreateTenantClient();
  const updateClient = useUpdateTenantClient();
  const deleteClient = useDeleteTenantClient();
  const rotateSecret = useRotateClientSecret();

  // Sync edit modal fields when client selected
  React.useEffect(() => {
    if (editingClient) {
      setEditName(editingClient.name);
      setEditRedirectUris(editingClient.redirectUris.join(', '));
      setEditGrantTypes(editingClient.grantTypes);
      setEditIsActive(editingClient.isActive);
      setRotatedSecret(null);
    }
  }, [editingClient]);

  // Adjust grant types based on client type
  React.useEffect(() => {
    if (createType === 'public') {
      setCreateGrantTypes(prev => prev.filter(t => t !== 'client_credentials'));
    }
  }, [createType]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName) return;
    try {
      const uris = createRedirectUris
        .split(',')
        .map(u => u.trim())
        .filter(Boolean);

      const res = await createClient.mutateAsync({
        name: createName,
        clientType: createType,
        redirectUris: uris,
        grantTypes: createGrantTypes,
      });
      setCreatedClient(res);
      setCreateName('');
      setCreateRedirectUris('');
      setCreateGrantTypes(['authorization_code', 'refresh_token']);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    try {
      const uris = editRedirectUris
        .split(',')
        .map(u => u.trim())
        .filter(Boolean);

      await updateClient.mutateAsync({
        id: editingClient.id,
        name: editName,
        redirectUris: uris,
        grantTypes: editGrantTypes,
        isActive: editIsActive,
      });
      setEditingClient(null);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleRotateSecret = async () => {
    if (!editingClient) return;
    try {
      const res = await rotateSecret.mutateAsync(editingClient.id);
      setRotatedSecret(res.clientSecret);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleDeleteClient = async () => {
    if (!editingClient) return;
    try {
      await deleteClient.mutateAsync(editingClient.id);
      setEditingClient(null);
      setIsConfirmDeleteOpen(false);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const toggleGrantType = (type: string, isCreate: boolean) => {
    if (isCreate) {
      setCreateGrantTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      );
    } else {
      setEditGrantTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      );
    }
  };

  const dialogStyle = {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    borderColor: 'rgba(255, 255, 255, 0.60)',
  };

  return (
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Applications"
          subtitle="Configure OAuth 2.0 and OIDC clients for your services"
          action={
            <SentryButton
              variant="accent"
              className="gap-2"
              onClick={() => {
                setCreatedClient(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Application
            </SentryButton>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SentrySkeleton key={i} className="h-[240px] w-full" />
            ))
          ) : clients && clients.length > 0 ? (
            clients.map((client) => (
              <GlassCard key={client.id} tier={1} className="p-6 flex flex-col group animate-fade-up">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-sm bg-black/5 flex items-center justify-center">
                      {client.clientType === 'public' ? <Monitor className="w-6 h-6 text-muted-foreground" /> : <Globe className="w-6 h-6 text-muted-foreground" />}
                    </div>
                    <div>
                      <h3 className="text-base font-display font-semibold group-hover:text-accent transition-colors">
                        {client.name}
                      </h3>
                      <p className="text-xs font-body text-muted-foreground uppercase tracking-wider mt-0.5">
                        {client.clientType === 'public' ? 'Public Client' : 'Confidential Client'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={client.isActive ? 'active' : 'suspended'} />
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                      Client ID
                    </label>
                    <TokenDisplay value={client.clientId} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                        Grant Types
                      </label>
                      <p className="text-xs font-body text-foreground truncate max-w-[200px]" title={(client.grantTypes ?? []).join(', ')}>
                        {(client.grantTypes ?? []).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                        Created
                      </label>
                      <p className="text-xs font-body text-muted-foreground">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-between">
                  {client.grantTypes.includes('authorization_code') && (
                    <div className="flex items-center gap-1.5 text-accent">
                      <Key className="w-3 h-3" />
                      <span className="text-[10px] font-display font-bold uppercase tracking-wider">OIDC Enabled</span>
                    </div>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <SentryButton
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-[11px] gap-2"
                      onClick={() => setEditingClient(client)}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configure
                    </SentryButton>
                  </div>
                </div>
              </GlassCard>
            ))
          ) : (
            <div className="lg:col-span-2 py-20 flex flex-col items-center justify-center border border-dashed border-border rounded-md">
              <AppWindow className="w-12 h-12 text-muted-foreground/20 mb-4" />
              <h3 className="text-sm font-display font-semibold mb-1">No Applications Yet</h3>
              <p className="text-xs font-body text-muted-foreground mb-6">Integrate your first service to start managing identities.</p>
              <SentryButton variant="accent" size="sm" onClick={() => setIsCreateOpen(true)}>Create Client</SentryButton>
            </div>
          )}
        </div>
      </div>

      {/* CREATE CLIENT DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setCreatedClient(null);
        }
      }}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">
              {createdClient ? 'Save Credentials' : 'Add Application'}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              {createdClient 
                ? 'Make sure to copy the client secret. You will not be able to retrieve it again.'
                : 'Register a new OAuth 2.0 / OpenID Connect client application.'}
            </DialogDescription>
          </DialogHeader>

          {createdClient ? (
            <div className="space-y-6 py-2">
              <div className="p-4 bg-accent/10 border border-accent/30 rounded-sm text-accent flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">Client Secret Generated</h4>
                  <p className="text-xs font-body text-neutral-700">For security reasons, this secret will only be displayed once.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  Client ID
                </label>
                <TokenDisplay value={createdClient.clientId} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  Client Secret
                </label>
                <TokenDisplay value={createdClient.clientSecret} />
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <SentryButton
                  variant="primary"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setCreatedClient(null);
                    setIsCreateOpen(false);
                  }}
                >
                  I have saved the credentials
                </SentryButton>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateClient} className="space-y-6 py-2">
              <SentryInput
                label="Application Name"
                placeholder="e.g. Next.js Frontend App"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />

              <div className="space-y-2">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                  Application Type
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className={cn(
                      "border p-4 rounded-sm cursor-pointer transition-all flex flex-col justify-between h-[110px]",
                      createType === 'confidential' ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                    )}
                    onClick={() => setCreateType('confidential')}
                  >
                    <div className="font-display text-xs font-bold uppercase tracking-wider">Confidential</div>
                    <div className="text-[10px] text-muted-foreground font-body leading-normal">For secure servers (e.g. Node, Java). Generates a client secret.</div>
                  </div>
                  <div
                    className={cn(
                      "border p-4 rounded-sm cursor-pointer transition-all flex flex-col justify-between h-[110px]",
                      createType === 'public' ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                    )}
                    onClick={() => setCreateType('public')}
                  >
                    <div className="font-display text-xs font-bold uppercase tracking-wider">Public</div>
                    <div className="text-[10px] text-muted-foreground font-body leading-normal">For SPAs or native apps (e.g. React, iOS). No client secret.</div>
                  </div>
                </div>
              </div>

              <SentryInput
                label="Redirect URIs"
                placeholder="e.g. http://localhost:3000/callback"
                value={createRedirectUris}
                onChange={(e) => setCreateRedirectUris(e.target.value)}
                helperText="Comma-separated list of allowed callback URLs."
              />

              <div className="space-y-3">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                  Allowed Grant Types
                </label>
                <div className="space-y-2.5">
                  {[
                    { id: 'authorization_code', label: 'Authorization Code (PKCE recommended)' },
                    { id: 'client_credentials', label: 'Client Credentials (Machine-to-Machine)' },
                    { id: 'refresh_token', label: 'Refresh Token' },
                  ].map((gt) => {
                    const disabled = gt.id === 'client_credentials' && createType === 'public';
                    const checked = createGrantTypes.includes(gt.id) && !disabled;
                    return (
                      <div key={gt.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`create-gt-${gt.id}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={() => toggleGrantType(gt.id, true)}
                        />
                        <label
                          htmlFor={`create-gt-${gt.id}`}
                          className={cn(
                            "text-xs font-body cursor-pointer select-none text-neutral-800",
                            disabled && "opacity-40 cursor-not-allowed text-neutral-500"
                          )}
                        >
                          {gt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="pt-4 border-t border-border/50 gap-2">
                <SentryButton
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </SentryButton>
                <SentryButton
                  type="submit"
                  variant="accent"
                  isLoading={createClient.isPending}
                >
                  Create Application
                </SentryButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* CONFIGURE CLIENT DIALOG */}
      <Dialog open={!!editingClient && !isConfirmDeleteOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingClient(null);
          setRotatedSecret(null);
        }
      }}>
        <DialogContent className="text-neutral-900 border max-w-lg" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">
              {rotatedSecret ? 'New Client Secret' : 'Configure Application'}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              {rotatedSecret 
                ? 'Save your new client secret immediately.' 
                : `Modify settings for ${editingClient?.name}.`}
            </DialogDescription>
          </DialogHeader>

          {rotatedSecret ? (
            <div className="space-y-6 py-2">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm text-amber-700 flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">Secret Rotated</h4>
                  <p className="text-xs font-body text-neutral-700">Any systems using the old secret will need to be updated.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  New Client Secret
                </label>
                <TokenDisplay value={rotatedSecret} />
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <SentryButton
                  variant="primary"
                  className="w-full sm:w-auto"
                  onClick={() => setRotatedSecret(null)}
                >
                  Done
                </SentryButton>
              </DialogFooter>
            </div>
          ) : editingClient ? (
            <form onSubmit={handleUpdateClient} className="space-y-6 py-2">
              <SentryInput
                label="Application Name"
                placeholder="e.g. Next.js Frontend App"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />

              <div className="space-y-1.5">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  Client ID
                </label>
                <TokenDisplay value={editingClient.clientId} />
              </div>

              <SentryInput
                label="Redirect URIs"
                placeholder="e.g. http://localhost:3000/callback"
                value={editRedirectUris}
                onChange={(e) => setEditRedirectUris(e.target.value)}
                helperText="Comma-separated list of allowed callback URLs."
              />

              <div className="space-y-3">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                  Allowed Grant Types
                </label>
                <div className="space-y-2.5">
                  {[
                    { id: 'authorization_code', label: 'Authorization Code (PKCE recommended)' },
                    { id: 'client_credentials', label: 'Client Credentials (Machine-to-Machine)' },
                    { id: 'refresh_token', label: 'Refresh Token' },
                  ].map((gt) => {
                    const disabled = gt.id === 'client_credentials' && editingClient.clientType === 'public';
                    const checked = editGrantTypes.includes(gt.id) && !disabled;
                    return (
                      <div key={gt.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`edit-gt-${gt.id}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={() => toggleGrantType(gt.id, false)}
                        />
                        <label
                          htmlFor={`edit-gt-${gt.id}`}
                          className={cn(
                            "text-xs font-body cursor-pointer select-none text-neutral-800",
                            disabled && "opacity-40 cursor-not-allowed text-neutral-500"
                          )}
                        >
                          {gt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-y border-border/50">
                <Checkbox
                  id="edit-is-active"
                  checked={editIsActive}
                  onCheckedChange={(checked) => setEditIsActive(!!checked)}
                />
                <div className="space-y-0.5">
                  <label htmlFor="edit-is-active" className="text-xs font-display font-bold uppercase tracking-wider text-neutral-800 cursor-pointer select-none">
                    Active Status
                  </label>
                  <p className="text-[10px] text-muted-foreground font-body">If disabled, this application cannot authenticate users or call APIs.</p>
                </div>
              </div>

              {editingClient.clientType === 'confidential' && (
                <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-sm flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-display font-bold uppercase tracking-wider text-amber-800">Rotate Client Secret</h4>
                    <p className="text-[10px] text-muted-foreground font-body leading-normal">Immediately invalidate current secret and generate a new one.</p>
                  </div>
                  <SentryButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] gap-1 shrink-0 border-amber-500/30 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800"
                    onClick={handleRotateSecret}
                    isLoading={rotateSecret.isPending}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rotate
                  </SentryButton>
                </div>
              )}

              <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-sm flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider text-destructive">Delete Application</h4>
                  <p className="text-[10px] text-muted-foreground font-body leading-normal">Permanently remove this application and invalidate all existing tokens.</p>
                </div>
                <SentryButton
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 text-[11px] gap-1 shrink-0"
                  onClick={() => setIsConfirmDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </SentryButton>
              </div>

              <DialogFooter className="pt-4 border-t border-border/50 gap-2">
                <SentryButton
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingClient(null)}
                >
                  Cancel
                </SentryButton>
                <SentryButton
                  type="submit"
                  variant="accent"
                  isLoading={updateClient.isPending}
                >
                  Save Changes
                </SentryButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Application?
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              This action is permanent and cannot be undone. All active configurations and integrations for <span className="font-semibold text-neutral-800">"{editingClient?.name}"</span> will stop working immediately.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton
              type="button"
              variant="ghost"
              onClick={() => setIsConfirmDeleteOpen(false)}
            >
              Cancel
            </SentryButton>
            <SentryButton
              type="button"
              variant="destructive"
              onClick={handleDeleteClient}
              isLoading={deleteClient.isPending}
            >
              Confirm Delete
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}


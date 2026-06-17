'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, TokenDisplay, StatusBadge, SentrySkeleton } from "@repo/ui";

import { useTenantClients } from '@/lib/queries';
import { Plus, AppWindow, Globe, Monitor, MoreHorizontal, Settings, Trash2, Key } from 'lucide-react';
import { cn } from "@repo/ui/lib/utils";


export default function ClientsPage() {
  const { data: clients, isLoading } = useTenantClients();

  return (
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Applications"
          subtitle="Configure OAuth 2.0 and OIDC clients for your services"
          action={
            <SentryButton variant="accent" className="gap-2">
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
                    <SentryButton variant="icon" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </SentryButton>
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
                      <p className="text-xs font-body text-foreground">{client.grantTypes.join(', ') || '—'}</p>
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
                  <div className="flex gap-2">
                    <SentryButton variant="ghost" size="sm" className="h-8 px-3 text-[11px] gap-2">
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
              <SentryButton variant="accent" size="sm">Create Client</SentryButton>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

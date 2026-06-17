'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, SentryInput, StatusBadge, SentrySkeleton } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";


import { useTenantRoles } from '@/lib/queries';
import {
  Shield,
  Plus,
  Search,
  ChevronRight,
  Lock,
} from 'lucide-react';

export default function RolesPage() {

  const { data: roles, isLoading } = useTenantRoles();
  const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);

  const selectedRole = roles?.find(r => r.id === selectedRoleId) || roles?.[0];

  React.useEffect(() => {
    if (roles && !selectedRoleId) {
      setSelectedRoleId(roles[0]?.id ?? null);
    }
  }, [roles, selectedRoleId]);

  return (
    <PortalLayout>
      <div className="space-y-8 h-full flex flex-col">
        <PageHeader
          title="Roles & Permissions"
          subtitle="Define access control policies for your workspace"
          action={
            <SentryButton variant="accent" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Role
            </SentryButton>
          }
        />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
          {/* Roles List Sidebar */}
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <SentryInput
                placeholder="Search roles..."
                className="pl-9 bg-black/5 border-transparent focus:bg-white"
              />
            </div>
            
            <GlassCard tier={1} className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SentrySkeleton key={i} className="h-14 w-full" />
                ))
              ) : (
                roles?.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-sm transition-all text-left group',
                      selectedRoleId === role.id 
                        ? 'bg-accent/10 border border-accent/20' 
                        : 'border border-transparent hover:bg-black/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-2 rounded-sm transition-colors',
                        selectedRoleId === role.id ? 'bg-accent/20 text-accent' : 'bg-black/5 text-muted-foreground'
                      )}>
                        <Shield className="w-3.5 h-3.5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className={cn(
                          'text-sm font-display font-semibold leading-none',
                          selectedRoleId === role.id ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {role.name}
                        </p>
                        <p className="text-[10px] font-body text-muted-foreground/60">
                          {role.isSystem ? 'System role' : 'Custom role'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      'w-3.5 h-3.5 transition-all',
                      selectedRoleId === role.id ? 'text-accent opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                    )} />
                  </button>
                ))
              )}
            </GlassCard>
          </div>

          {/* Role Detail Panel */}
          <div className="lg:col-span-2 min-h-0">
            {selectedRole ? (
              <GlassCard tier={2} className="h-full flex flex-col p-8">
                <div className="flex items-start justify-between mb-8">
                  <div className="space-y-1">
                    <h2 className="text-xl font-display font-semibold">{selectedRole.name}</h2>
                    <p className="text-sm font-body text-muted-foreground">{selectedRole.description || 'System-level access policy'}</p>
                  </div>
                  <div className="flex gap-2">
                    <SentryButton variant="ghost" size="sm">Edit</SentryButton>
                    {selectedRole.isSystem && (
                      <StatusBadge status="system">System Protected</StatusBadge>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-8 scrollbar-hide">
                  <section className="space-y-4">
                    <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 border-b border-border/50 pb-2">
                      Granted Permissions
                    </h3>
                    {selectedRole.rolePermissions && selectedRole.rolePermissions.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedRole.rolePermissions.map(({ permission }) => (
                          <div key={permission.id} className="flex items-center gap-3 p-3 border border-border rounded-sm bg-black/5">
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-body font-medium">{permission.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-body text-muted-foreground">No permissions assigned to this role.</p>
                    )}
                  </section>
                </div>

                <div className="mt-8 pt-6 border-t border-border/50 flex justify-end gap-3">
                   <SentryButton variant="ghost" className="text-destructive border-destructive/20 hover:bg-destructive/5">Delete Role</SentryButton>
                   <SentryButton variant="accent">Save Changes</SentryButton>
                </div>
              </GlassCard>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-border rounded-md">
                <p className="text-sm font-body text-muted-foreground">Select a role to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

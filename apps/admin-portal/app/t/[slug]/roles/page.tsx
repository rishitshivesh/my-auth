'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import {
  GlassCard,
  PageHeader,
  SentryButton,
  SentryInput,
  StatusBadge,
  SentrySkeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";

import {
  useTenantRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole
} from '@/lib/queries';
import {
  Shield,
  Plus,
  Search,
  ChevronRight,
  Lock,
  AlertTriangle,
  Info
} from 'lucide-react';

export default function RolesPage() {
  const { data: roles, isLoading } = useTenantRoles();
  const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Create Role Dialog State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createDescription, setCreateDescription] = React.useState('');

  // Edit Role Dialog State
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');

  // Delete Confirmation State
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const filteredRoles = roles?.filter(role =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedRole = roles?.find(r => r.id === selectedRoleId) || filteredRoles?.[0] || roles?.[0];

  React.useEffect(() => {
    if (roles && !selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles[0]?.id ?? null);
    }
  }, [roles, selectedRoleId]);

  // Sync edit form fields when editing role changes or edit modal opens
  React.useEffect(() => {
    if (selectedRole) {
      setEditName(selectedRole.name);
      setEditDescription(selectedRole.description || '');
    }
  }, [selectedRole, isEditOpen]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName) return;
    try {
      const newRole = await createRole.mutateAsync({
        name: createName,
        description: createDescription,
      });
      setIsCreateOpen(false);
      setCreateName('');
      setCreateDescription('');
      if (newRole) {
        setSelectedRoleId(newRole.id);
      }
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    try {
      await updateRole.mutateAsync({
        id: selectedRole.id,
        name: editName,
        description: editDescription,
      });
      setIsEditOpen(false);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) return;
    try {
      await deleteRole.mutateAsync(selectedRole.id);
      setIsDeleteOpen(false);
      setSelectedRoleId(null);
    } catch (err: unknown) {
      // Handled by withErrorHandler
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
      <div className="space-y-8 h-full flex flex-col">
        <PageHeader
          title="Roles & Permissions"
          subtitle="Define access control policies for your workspace"
          action={
            <SentryButton variant="accent" className="gap-2" onClick={() => setIsCreateOpen(true)}>
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-black/5 border-transparent focus:bg-white"
              />
            </div>
            
            <GlassCard tier={1} className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SentrySkeleton key={i} className="h-14 w-full" />
                ))
              ) : filteredRoles && filteredRoles.length > 0 ? (
                filteredRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-sm transition-all text-left group',
                      selectedRole?.id === role.id 
                        ? 'bg-accent/10 border border-accent/20' 
                        : 'border border-transparent hover:bg-black/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-2 rounded-sm transition-colors',
                        selectedRole?.id === role.id ? 'bg-accent/20 text-accent' : 'bg-black/5 text-muted-foreground'
                      )}>
                        <Shield className="w-3.5 h-3.5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className={cn(
                          'text-sm font-display font-semibold leading-none',
                          selectedRole?.id === role.id ? 'text-foreground' : 'text-muted-foreground'
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
                      selectedRole?.id === role.id ? 'text-accent opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                    )} />
                  </button>
                ))
              ) : (
                <div className="py-8 text-center">
                  <p className="text-xs font-body text-muted-foreground">No roles found</p>
                </div>
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
                    <p className="text-sm font-body text-muted-foreground">{selectedRole.description || 'Custom security policy'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedRole.isSystem ? (
                      <StatusBadge status="system">System Protected</StatusBadge>
                    ) : (
                      <SentryButton
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setIsEditOpen(true)}
                      >
                        Edit Details
                      </SentryButton>
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
                        {selectedRole.rolePermissions.map(({ permission }) => permission ? (
                          <div key={permission.id} className="flex items-center gap-3 p-3 border border-border rounded-sm bg-black/5">
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-body font-medium">{permission.name}</span>
                          </div>
                        ) : null)}
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5 p-3 rounded-sm bg-black/5 text-muted-foreground text-xs font-body">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>No explicit permissions assigned to this role. Users with this role will inherit base tenant access permissions.</p>
                      </div>
                    )}
                  </section>
                </div>

                {!selectedRole.isSystem && (
                  <div className="mt-8 pt-6 border-t border-border/50 flex justify-end gap-3">
                    <SentryButton
                      variant="ghost"
                      className="text-destructive border-destructive/20 hover:bg-destructive/5"
                      onClick={() => setIsDeleteOpen(true)}
                    >
                      Delete Role
                    </SentryButton>
                  </div>
                )}
              </GlassCard>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-border rounded-md">
                <p className="text-sm font-body text-muted-foreground">Select a role to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE ROLE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">Create Role</DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              Define a new workspace role. Permissions can be mapped after creation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRole} className="space-y-6 py-2">
            <SentryInput
              label="Role Name"
              placeholder="e.g. billing_admin"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />

            <SentryInput
              label="Description"
              placeholder="e.g. Manages subscription payments and billing history"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />

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
                isLoading={createRole.isPending}
              >
                Create Role
              </SentryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT ROLE DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">Edit Role Details</DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              Update the name and description of this custom role.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateRole} className="space-y-6 py-2">
            <SentryInput
              label="Role Name"
              placeholder="e.g. billing_admin"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />

            <SentryInput
              label="Description"
              placeholder="e.g. Manages subscription payments and billing history"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />

            <DialogFooter className="pt-4 border-t border-border/50 gap-2">
              <SentryButton
                type="button"
                variant="ghost"
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </SentryButton>
              <SentryButton
                type="submit"
                variant="accent"
                isLoading={updateRole.isPending}
              >
                Save Changes
              </SentryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Role?
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              This action is permanent. Any users or policies assigned to <span className="font-semibold text-neutral-800">"{selectedRole?.name}"</span> will lose the associated permissions immediately.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteOpen(false)}
            >
              Cancel
            </SentryButton>
            <SentryButton
              type="button"
              variant="destructive"
              onClick={handleDeleteRole}
              isLoading={deleteRole.isPending}
            >
              Confirm Delete
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}


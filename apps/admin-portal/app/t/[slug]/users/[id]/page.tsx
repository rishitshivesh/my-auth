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
  AuditTimeline,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { Textarea } from '@repo/ui/components/ui/textarea';
import {
  useTenantUser,
  useTenantRoles,
  useUserRoles,
  useAssignRolesToUser,
  useRevokeRoleFromUser,
  useUserEffectivePermissions,
  useSuspendUser,
  useDeleteTenantUser,
  useAdminUserSessions,
  useAdminRevokeUserSession,
  useAdminUserAudit,
} from '@/lib/queries';
import { listTotpDevices } from '@/lib/mfa-device-store';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Mail,
  Clock,
  Ban,
  Trash2,
  KeyRound,
  Fingerprint,
  Laptop,
  Smartphone,
  Globe,
  Shield,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from "@repo/ui/lib/utils";

function userStatusBadge(status: string): 'active' | 'pending' | 'suspended' | 'admin' | 'mfa' | 'system' {
  if (status === 'active') return 'active';
  if (status === 'suspended' || status === 'deleted') return 'suspended';
  return 'system';
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const userId = params.id as string;

  const { data: user, isLoading } = useTenantUser(userId);
  const { data: sessions, isLoading: sessionsLoading } = useAdminUserSessions(userId);
  const { data: auditEvents, isLoading: auditLoading } = useAdminUserAudit(userId);
  const revokeSessionMutation = useAdminRevokeUserSession();

  // Roles & Permissions tab data
  const { data: userRoles, isLoading: rolesLoading } = useUserRoles(userId);
  const { data: allRoles } = useTenantRoles();
  const assignRoles = useAssignRolesToUser();
  const revokeRole = useRevokeRoleFromUser();
  const [showEffectivePerms, setShowEffectivePerms] = React.useState(false);
  const { data: effectivePermissions, isLoading: effectivePermsLoading } = useUserEffectivePermissions(
    showEffectivePerms ? userId : ''
  );

  // Assign role dialog
  const [assignRoleOpen, setAssignRoleOpen] = React.useState(false);
  const [selectedRoleName, setSelectedRoleName] = React.useState('');
  const [assignReason, setAssignReason] = React.useState('');
  const [revokeTarget, setRevokeTarget] = React.useState<string | null>(null);

  // Suspend dialog
  const [suspendOpen, setSuspendOpen] = React.useState(false);
  const [suspendReason, setSuspendReason] = React.useState('');
  const suspendUser = useSuspendUser();

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState('');
  const deleteUser = useDeleteTenantUser();

  const handleRevokeSession = (sessionId: string) => {
    revokeSessionMutation.mutate({ userId, sessionId });
  };

  type Tab = 'overview' | 'sessions' | 'devices' | 'audit' | 'roles';
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [totpDevices, setTotpDevices] = React.useState<ReturnType<typeof listTotpDevices>>([]);

  React.useEffect(() => {
    setTotpDevices(listTotpDevices(userId));
  }, [userId]);

  const handleAssignRole = async () => {
    if (!selectedRoleName) return;
    try {
      await assignRoles.mutateAsync({
        userId,
        roleNames: [selectedRoleName],
        reason: assignReason || undefined,
      });
      setAssignRoleOpen(false);
      setSelectedRoleName('');
      setAssignReason('');
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleRevokeRole = async (roleName: string) => {
    try {
      await revokeRole.mutateAsync({ userId, roleName });
      setRevokeTarget(null);
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) return;
    try {
      await suspendUser.mutateAsync({ userId, reason: suspendReason });
      setSuspendOpen(false);
      setSuspendReason('');
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== user?.email) return;
    try {
      await deleteUser.mutateAsync(userId);
      setDeleteOpen(false);
      router.push(`/t/${slug}/users`);
    } catch {
      // handled by withErrorHandler
    }
  };

  // Roles available to assign (exclude already-assigned)
  const assignedRoleNames = new Set((userRoles ?? []).map(a => a.role?.name).filter(Boolean));
  const assignableRoles = (allRoles ?? []).filter(r => !assignedRoleNames.has(r.name));

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-8 animate-pulse">
          <div className="h-8 w-48 bg-black/5 rounded-sm" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="h-[400px] bg-black/5 rounded-sm" />
            <div className="lg:col-span-2 h-[400px] bg-black/5 rounded-sm" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!user) return null;

  return (
    <PortalLayout>
      <div className="space-y-8">
        <button
          onClick={() => router.back()}
          className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground hover:text-accent transition-colors flex items-center gap-1.5 mb-2"
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Users
        </button>

        <PageHeader
          title={user.displayName || user.email}
          subtitle={`User ID: ${user.id}`}
          action={
            <div className="flex gap-3">
              <SentryButton variant="ghost" className="gap-2">
                <Mail className="w-4 h-4" />
                Reset Password
              </SentryButton>
              <SentryButton variant="accent">Edit Profile</SentryButton>
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Profile Card */}
          <div className="space-y-6">
            <GlassCard tier={2} className="p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center text-2xl font-display font-bold text-accent mb-6">
                {user.displayName?.slice(0, 2).toUpperCase() || user.email.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-xl font-display font-semibold mb-1">{user.displayName || 'Unnamed User'}</h2>
              <p className="text-sm font-body text-muted-foreground mb-4">{user.email}</p>
              <StatusBadge status={userStatusBadge(user.status)} className="mb-8">
                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
              </StatusBadge>

              <div className="w-full space-y-4 pt-6 border-t border-border/50 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.08em] text-muted-foreground/60">Auth Method</span>
                  <span className="text-xs font-body font-medium flex items-center gap-1.5">
                    {user.primaryAuthMethod === 'passkey' ? <Fingerprint className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}
                    {user.primaryAuthMethod || 'Password'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.08em] text-muted-foreground/60">MFA Status</span>
                  <StatusBadge status={user.mfaEnabled ? 'active' : 'system'} className="px-1.5">
                    {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.08em] text-muted-foreground/60">Created</span>
                  <span className="text-xs font-body text-muted-foreground">
                    {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
            </GlassCard>

            <GlassCard tier={1} className="p-6 border-destructive/20 bg-destructive/[0.02]">
              <h3 className="text-xs font-display font-bold uppercase tracking-[0.1em] text-destructive mb-4">Danger Zone</h3>
              <div className="space-y-3">
                <SentryButton
                  variant="destructive"
                  className="w-full justify-start gap-3 h-10 text-xs"
                  onClick={() => setSuspendOpen(true)}
                >
                  <Ban className="w-3.5 h-3.5" />
                  Suspend Access
                </SentryButton>
                <SentryButton
                  variant="destructive"
                  className="w-full justify-start gap-3 h-10 text-xs bg-transparent border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Identity
                </SentryButton>
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Content Tabs */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex gap-8 border-b border-border mb-6 overflow-x-auto">
              {[
                { id: 'overview', label: 'Security Overview' },
                { id: 'sessions', label: 'Active Sessions' },
                { id: 'devices', label: 'Security Devices' },
                { id: 'audit', label: 'Audit Log' },
                { id: 'roles', label: 'Roles & Permissions' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    'pb-4 text-xs font-display font-bold uppercase tracking-[0.12em] transition-all relative whitespace-nowrap shrink-0',
                    activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                  )}
                </button>
              ))}
            </div>

            <div className="animate-fade-in">
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GlassCard tier={1} className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-sm bg-black/5">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <h4 className="text-sm font-display font-semibold">Email Verification</h4>
                    </div>
                    <StatusBadge status={user.emailVerified ? 'active' : 'pending'}>
                      {user.emailVerified ? 'Verified' : 'Unverified'}
                    </StatusBadge>
                  </GlassCard>

                  <GlassCard tier={1} className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-sm bg-black/5">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <h4 className="text-sm font-display font-semibold">Last Login</h4>
                    </div>
                    <p className="text-sm font-body text-foreground">
                      {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MMM dd, yyyy · h:mm a') : 'Never logged in'}
                    </p>
                  </GlassCard>
                </div>
              )}

              {activeTab === 'roles' && (
                <GlassCard tier={1} className="p-8 space-y-8">
                  {/* Assigned Roles */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-3">
                      <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                        Assigned Roles
                      </h3>
                      <SentryButton
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px]"
                        onClick={() => setAssignRoleOpen(true)}
                      >
                        <Plus className="w-3 h-3" />
                        Assign Role
                      </SentryButton>
                    </div>

                    {rolesLoading ? (
                      <div className="space-y-3">
                        <SentrySkeleton className="h-12 w-full" />
                        <SentrySkeleton className="h-12 w-full" />
                      </div>
                    ) : !userRoles || userRoles.length === 0 ? (
                      <div className="py-6 text-center text-muted-foreground font-body text-sm">
                        No roles assigned. Assign a role to grant workspace access.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {userRoles.map((assignment) => (
                          <div key={assignment.id} className="flex items-center justify-between p-3 bg-black/5 rounded-sm border border-border">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-sm bg-accent/10 text-accent">
                                <Shield className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <p className="text-sm font-body font-medium">{assignment.role?.name ?? '—'}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  Assigned {format(new Date(assignment.assignedAt), 'MMM dd, yyyy')}
                                  {assignment.expiresAt && ` · Expires ${format(new Date(assignment.expiresAt), 'MMM dd, yyyy')}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {assignment.role?.isSystem && <StatusBadge status="system" className="px-1.5">System</StatusBadge>}
                              {revokeTarget === assignment.id ? (
                                <div className="flex items-center gap-1">
                                  <SentryButton
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-[11px]"
                                    onClick={() => handleRevokeRole(assignment.role?.name ?? '')}
                                    isLoading={revokeRole.isPending}
                                  >
                                    Confirm
                                  </SentryButton>
                                  <SentryButton
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[11px]"
                                    onClick={() => setRevokeTarget(null)}
                                  >
                                    Cancel
                                  </SentryButton>
                                </div>
                              ) : (
                                <SentryButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                                  onClick={() => setRevokeTarget(assignment.id)}
                                >
                                  Revoke
                                </SentryButton>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Effective Permissions (collapsible) */}
                  <div className="space-y-4">
                    <button
                      onClick={() => setShowEffectivePerms(v => !v)}
                      className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 border-b border-border/50 pb-3 w-full hover:text-muted-foreground transition-colors"
                    >
                      Effective Permissions
                      {showEffectivePerms ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>

                    {showEffectivePerms && (
                      effectivePermsLoading ? (
                        <div className="space-y-2">
                          <SentrySkeleton className="h-8 w-full" />
                          <SentrySkeleton className="h-8 w-full" />
                        </div>
                      ) : !effectivePermissions || effectivePermissions.length === 0 ? (
                        <p className="text-sm font-body text-muted-foreground py-2">No effective permissions found.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {effectivePermissions.map((perm) => (
                            <span
                              key={perm.id}
                              className="text-[11px] font-mono px-2 py-1 rounded-sm bg-accent/10 text-accent border border-accent/20"
                            >
                              {perm.name}
                            </span>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </GlassCard>
              )}

              {activeTab === 'devices' && (
                <GlassCard tier={1} className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-display font-semibold">Security Devices</h3>
                    <p className="text-xs text-muted-foreground font-body">MFA and passwordless devices for this user</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-400">Authenticator Apps (TOTP)</h4>
                      {totpDevices.length === 0 ? (
                        <p className="text-xs font-body text-neutral-400 italic">
                          No authenticator apps registered in browser cache for this user.
                        </p>
                      ) : (
                        <div className="divide-y divide-neutral-100">
                          {totpDevices.map((device) => (
                            <div key={device.id} className="flex items-center justify-between py-2.5 text-sm">
                              <div className="flex items-center gap-2">
                                <Smartphone className="w-4 h-4 text-neutral-400" />
                                <span className="font-body font-medium text-neutral-800">{device.name}</span>
                              </div>
                              <span className="text-xs font-body text-neutral-500">
                                Added {new Date(device.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-border/40 space-y-3">
                      <h4 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-400">MFA Configuration</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm bg-black/[0.02] p-4 rounded border border-border/40">
                        <div>
                          <span className="text-xs text-neutral-400 font-body block">MFA Status</span>
                          <span className="font-body font-semibold text-neutral-800">{user.mfaEnabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-400 font-body block">Primary Auth Method</span>
                          <span className="font-body font-semibold text-neutral-800 capitalize">{user.primaryAuthMethod || 'Password'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40 text-xs text-neutral-400 font-body leading-relaxed flex gap-2">
                      <KeyRound className="w-4 h-4 flex-shrink-0 text-neutral-400" />
                      <p>
                        Passkeys and biometric credentials are cryptographic keys securely bound to the user's local hardware device. They are managed directly by the user on their security settings panel.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {activeTab === 'audit' && (
                <GlassCard tier={1} className="p-8">
                  {auditLoading ? (
                    <div className="space-y-8">
                      <SentrySkeleton className="h-12 w-full" />
                      <SentrySkeleton className="h-12 w-full" />
                      <SentrySkeleton className="h-12 w-full" />
                    </div>
                  ) : !auditEvents || auditEvents.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground font-body text-sm">
                      No audit events found for this user.
                    </div>
                  ) : (
                    <AuditTimeline
                      events={auditEvents.map(a => ({
                        id: a.id,
                        type: a.eventType,
                        description: `Accessed from IP ${a.ipAddress || 'unknown'}`,
                        timestamp: a.createdAt,
                        metadata: a.metadata,
                      }))}
                    />
                  )}
                </GlassCard>
              )}

              {activeTab === 'sessions' && (
                <GlassCard tier={1} className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-display font-semibold">Active Devices & Sessions</h3>
                    <p className="text-xs text-muted-foreground font-body">Manage active logins for this user</p>
                  </div>
                  {sessionsLoading ? (
                    <div className="space-y-4">
                      <SentrySkeleton className="h-16 w-full" />
                      <SentrySkeleton className="h-16 w-full" />
                    </div>
                  ) : !sessions || sessions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground font-body text-sm">
                      No active sessions found.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sessions.map((session) => {
                        const isDesktop = !session.deviceInfo?.device || session.deviceInfo.device.toLowerCase().includes('desktop');
                        const DeviceIcon = isDesktop ? Laptop : Smartphone;
                        return (
                          <div
                            key={session.id}
                            className="flex items-center justify-between p-4 bg-black/5 rounded-sm border border-border transition-all hover:bg-black/[0.08]"
                          >
                            <div className="flex items-center gap-4">
                              <div className="p-2.5 rounded-sm bg-background border border-border text-muted-foreground">
                                <DeviceIcon className="w-5 h-5" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-body font-medium text-foreground">
                                    {session.deviceInfo?.browser || 'Unknown Browser'} on {session.deviceInfo?.os || 'Unknown OS'}
                                  </span>
                                  {session.current && (
                                    <span className="text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-accent/15 text-accent border border-accent/20">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground font-body">
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3.5 h-3.5" />
                                    {session.location?.city ? `${session.location.city}, ${session.location.country}` : 'Unknown Location'}
                                  </span>
                                  <span className="font-mono text-[11px] bg-black/5 px-1.5 py-0.5 rounded-sm">
                                    {session.ipAddress || 'Unknown IP'}
                                  </span>
                                  <span>
                                    Last active {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {!session.current && (
                              <SentryButton
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-transparent hover:border-destructive/20"
                                onClick={() => handleRevokeSession(session.id)}
                                isLoading={revokeSessionMutation.isPending && revokeSessionMutation.variables?.sessionId === session.id}
                                title="Revoke Session"
                              >
                                <Trash2 className="w-4 h-4" />
                              </SentryButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ASSIGN ROLE DIALOG */}
      <Dialog open={assignRoleOpen} onOpenChange={(o) => { if (!o) { setAssignRoleOpen(false); setSelectedRoleName(''); setAssignReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>Grant a workspace role to {user.displayName ?? user.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Select value={selectedRoleName} onValueChange={setSelectedRoleName}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map(role => (
                  <SelectItem key={role.id} value={role.name}>
                    {role.displayName ?? role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Reason for assignment (optional)"
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setAssignRoleOpen(false); setSelectedRoleName(''); setAssignReason(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="accent"
              disabled={!selectedRoleName || assignRoles.isPending}
              onClick={handleAssignRole}
              isLoading={assignRoles.isPending}
            >
              Assign Role
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUSPEND DIALOG */}
      <Dialog open={suspendOpen} onOpenChange={(o) => { if (!o) { setSuspendOpen(false); setSuspendReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Suspend {user.displayName ?? user.email}?
            </DialogTitle>
            <DialogDescription>
              The user will lose access immediately. You can restore them later from the user detail page.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for suspension (required)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setSuspendOpen(false); setSuspendReason(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="destructive"
              disabled={!suspendReason.trim() || suspendUser.isPending}
              onClick={handleSuspend}
              isLoading={suspendUser.isPending}
            >
              Suspend User
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) { setDeleteOpen(false); setDeleteConfirm(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Delete {user.displayName ?? user.email}?
            </DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type{' '}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{user.email}</code> to confirm.
            </DialogDescription>
          </DialogHeader>
          <SentryInput
            placeholder={user.email}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="font-mono"
          />
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="destructive"
              disabled={deleteConfirm !== user.email || deleteUser.isPending}
              onClick={handleDelete}
              isLoading={deleteUser.isPending}
            >
              Delete Permanently
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}

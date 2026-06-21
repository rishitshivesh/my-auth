'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, StatusBadge, SentrySkeleton, AuditTimeline } from "@repo/ui";
import { useTenantUser } from '@/lib/queries';
import { listTotpDevices } from '@/lib/mfa-device-store';
import { useUserSessions, useRevokeSession, useAuditLog } from '@scrolloop/admin-client';
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
  Globe
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
  const { data: sessions, isLoading: sessionsLoading } = useUserSessions(userId);
  const {
    data: auditData,
    isLoading: auditLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useAuditLog({ userId });

  const revokeSessionMutation = useRevokeSession();

  const handleRevokeSession = (sessionId: string) => {
    revokeSessionMutation.mutate({ sessionId, userId });
  };

  const auditEvents = auditData?.pages.flatMap((page) => page.items) || [];

  type Tab = 'overview' | 'sessions' | 'devices' | 'audit';
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [totpDevices, setTotpDevices] = React.useState<ReturnType<typeof listTotpDevices>>([]);

  React.useEffect(() => {
    setTotpDevices(listTotpDevices(userId));
  }, [userId]);

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
              <SentryButton variant="accent">
                Edit Profile
              </SentryButton>
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
                <SentryButton variant="destructive" className="w-full justify-start gap-3 h-10 text-xs">
                  <Ban className="w-3.5 h-3.5" />
                  Suspend Access
                </SentryButton>
                <SentryButton variant="destructive" className="w-full justify-start gap-3 h-10 text-xs bg-transparent border-destructive/30 text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Identity
                </SentryButton>
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Content Tabs */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex gap-8 border-b border-border mb-6">
              {[
                { id: 'overview', label: 'Security Overview' },
                { id: 'sessions', label: 'Active Sessions' },
                { id: 'devices', label: 'Security Devices' },
                { id: 'audit', label: 'Audit Log' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    'pb-4 text-xs font-display font-bold uppercase tracking-[0.12em] transition-all relative',
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

              {activeTab === 'devices' && (
                <GlassCard tier={1} className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-display font-semibold">Security Devices</h3>
                    <p className="text-xs text-muted-foreground font-body">MFA and passwordless devices for this user</p>
                  </div>
                  
                  <div className="space-y-6">
                    {/* TOTP Authenticator Devices */}
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

                    {/* General MFA Status */}
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

                    {/* Passkeys explanation */}
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
                  ) : auditEvents.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground font-body text-sm">
                      No audit events found for this user.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <AuditTimeline 
                        events={auditEvents.map(a => ({
                          id: a.id,
                          type: a.eventType,
                          description: `Accessed from IP ${a.ipAddress || 'unknown'}`,
                          timestamp: a.createdAt,
                          metadata: a.metadata,
                        }))} 
                      />
                      {hasNextPage && (
                        <div className="flex justify-center pt-4">
                          <SentryButton 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => fetchNextPage()}
                            isLoading={isFetchingNextPage}
                          >
                            Load More
                          </SentryButton>
                        </div>
                      )}
                    </div>
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
    </PortalLayout>
  );
}

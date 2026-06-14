'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, StatusBadge, SentrySkeleton, AuditTimeline } from "@repo/ui";
import { useTenantUser, useTenantActivity } from '@/lib/queries';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Mail, 
  Shield, 
  Clock, 
  MapPin, 
  Monitor,
  Ban,
  Trash2,
  KeyRound,
  Fingerprint
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "@repo/ui/lib/utils";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const userId = params.id as string;

  const { data: user, isLoading } = useTenantUser(userId);
  const { data: activity, isLoading: activityLoading } = useTenantActivity(10);

  const [activeTab, setActiveTab] = React.useState<'overview' | 'sessions' | 'audit'>('overview');

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
              <StatusBadge status={user.status as any} className="mb-8" />
              
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
                { id: 'audit', label: 'Audit Log' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
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
                        <Monitor className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <h4 className="text-sm font-display font-semibold">Primary Device</h4>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-body text-foreground">MacBook Pro &middot; Chrome</p>
                      <p className="text-xs font-body text-muted-foreground">Last used from San Francisco, US</p>
                    </div>
                  </GlassCard>

                  <GlassCard tier={1} className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-sm bg-black/5">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <h4 className="text-sm font-display font-semibold">Trust Score</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-black/5 rounded-full overflow-hidden">
                        <div className="h-full bg-accent w-[92%]" />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-accent">92%</span>
                    </div>
                  </GlassCard>
                </div>
              )}

              {activeTab === 'audit' && (
                <GlassCard tier={1} className="p-8">
                  {activityLoading ? (
                    <div className="space-y-8">
                      <SentrySkeleton className="h-12 w-full" />
                      <SentrySkeleton className="h-12 w-full" />
                      <SentrySkeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <AuditTimeline 
                      events={activity?.map(a => ({
                        id: a.id,
                        type: a.eventType,
                        description: `Accessed from IP ${a.ipAddress}`,
                        timestamp: a.createdAt,
                      })) || []} 
                    />
                  )}
                </GlassCard>
              )}

              {activeTab === 'sessions' && (
                <div className="py-12 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-sm font-body text-muted-foreground">Session management coming soon.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

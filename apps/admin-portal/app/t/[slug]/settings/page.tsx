'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, SentryInput } from "@repo/ui";
import { useTenantSettings, useUpdateTenantSettings } from '@/lib/queries';
import { useParams } from 'next/navigation';
import { 
  Settings as SettingsIcon, 
  Shield, 
  Palette, 
  Trash2, 
  Save,
  Globe,
  Lock,
  Mail
} from 'lucide-react';
import { cn } from "@repo/ui/lib/utils";

export default function SettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const { data: settings, isLoading } = useTenantSettings();
  const { mutate: updateSettings, isPending } = useUpdateTenantSettings();

  const [activeTab, setActiveTab] = React.useState<'general' | 'branding' | 'security' | 'danger'>('general');

  return (
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Tenant Settings"
          subtitle="Configure your workspace environment and branding"
          action={
            <SentryButton variant="accent" className="gap-2" onClick={() => {}} isLoading={isPending}>
              <Save className="w-4 h-4" />
              Save Changes
            </SentryButton>
          }
        />

        <div className="flex gap-8 border-b border-border mb-8">
          {[
            { id: 'general', label: 'General', icon: SettingsIcon },
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'security', label: 'Security', icon: Shield },
            { id: 'danger', label: 'Danger Zone', icon: Trash2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'pb-4 text-xs font-display font-bold uppercase tracking-[0.12em] transition-all relative flex items-center gap-2',
                activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                tab.id === 'danger' && activeTab === 'danger' && 'text-destructive'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {activeTab === tab.id && (
                <div className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5",
                  tab.id === 'danger' ? "bg-destructive" : "bg-accent"
                )} />
              )}
            </button>
          ))}
        </div>

        <div className="max-w-3xl animate-fade-in">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <GlassCard tier={1} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SentryInput 
                    label="Workspace Name" 
                    defaultValue="Acme Corporation" 
                    placeholder="Enter name"
                  />
                  <SentryInput 
                    label="Workspace Slug" 
                    value={slug} 
                    disabled 
                    helperText="Slugs cannot be changed after creation"
                  />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                     Workspace Description
                   </label>
                   <textarea
                     className="w-full min-h-[100px] rounded-sm border border-border bg-black/5 px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                     placeholder="A brief description of your organization"
                   />
                </div>
              </GlassCard>

              <GlassCard tier={1} className="p-8 space-y-6">
                <h3 className="text-sm font-display font-semibold">Discovery</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-black/5 rounded-sm border border-border">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-body font-medium">Custom Domain</p>
                        <p className="text-xs font-body text-muted-foreground">Map your own domain to Sentry</p>
                      </div>
                    </div>
                    <SentryButton variant="ghost" size="sm">Configure</SentryButton>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <GlassCard tier={1} className="p-8 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-display font-semibold">Password Policy</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-body font-medium">Require numbers</p>
                        <p className="text-xs font-body text-muted-foreground">Passwords must contain at least one digit</p>
                      </div>
                      <div className="w-10 h-5 bg-accent rounded-full relative cursor-pointer shadow-[0_0_8px_rgba(42,191,108,0.3)]">
                        <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-body font-medium">Minimum length</p>
                        <p className="text-xs font-body text-muted-foreground">Set minimum characters for user passwords</p>
                      </div>
                      <span className="text-xs font-mono font-bold">12</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-border/50 space-y-4">
                   <h3 className="text-sm font-display font-semibold">Multi-Factor Authentication</h3>
                   <div className="p-4 bg-accent/5 border border-accent/20 rounded-sm flex items-start gap-4">
                     <Lock className="w-5 h-5 text-accent mt-0.5" />
                     <div className="space-y-1">
                       <p className="text-sm font-display font-semibold text-accent">Adaptive MFA Recommended</p>
                       <p className="text-xs font-body text-muted-foreground leading-relaxed">
                         Enable Adaptive MFA to automatically trigger challenges based on anomalous login behavior.
                       </p>
                       <SentryButton variant="accent" size="sm" className="mt-4 h-8 px-4 text-[10px]">Enable Adaptive</SentryButton>
                     </div>
                   </div>
                </div>
              </GlassCard>
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-6">
              <GlassCard tier={1} className="p-8 border-destructive/20 bg-destructive/[0.01] space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-display font-semibold text-destructive">Delete Organization</h3>
                  <p className="text-xs font-body text-muted-foreground">
                    Permanently remove this workspace and all associated users, applications, and logs. This action cannot be undone.
                  </p>
                </div>
                <div className="pt-4">
                   <SentryButton variant="destructive" className="h-10 px-6">
                     Delete Entire Workspace
                   </SentryButton>
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

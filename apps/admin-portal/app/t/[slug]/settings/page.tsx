'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, SentryInput, SentrySkeleton } from "@repo/ui";
import {
  useTenantSettings,
  useUpdateTenantSettings,
  useUpdateTenantName,
  useCurrentTenant,
  useUpdateSocialProvider,
  useBranding,
  useUpdateBranding,
  useUploadLogo,
} from '@/lib/queries';
import { FONT_FAMILY_OPTIONS, type HeaderWeight, type BackgroundStyle } from '@/lib/types';
import { useParams } from 'next/navigation';
import {
  Settings as SettingsIcon,
  Shield,
  Palette,
  Trash2,
  Save,
  Lock,
  Upload,
} from 'lucide-react';
import { cn } from "@repo/ui/lib/utils";

type Tab = 'general' | 'branding' | 'security' | 'danger';

export default function SettingsPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: settings, isLoading: settingsLoading } = useTenantSettings();
  const { mutate: updateSettings, isPending: settingsSaving } = useUpdateTenantSettings();
  const { mutate: updateTenantName, isPending: nameSaving } = useUpdateTenantName();
  const { data: currentTenant } = useCurrentTenant();
  const { mutate: updateSocialProvider, isPending: socialSaving } = useUpdateSocialProvider();

  const [workspaceName, setWorkspaceName] = React.useState('');
  React.useEffect(() => {
    if (currentTenant?.name) setWorkspaceName(currentTenant.name);
  }, [currentTenant]);

  const { data: branding, isLoading: brandingLoading } = useBranding();
  const { mutate: updateBranding, isPending: brandingSaving } = useUpdateBranding();
  const { mutate: uploadLogo, isPending: logoUploading } = useUploadLogo();

  const [activeTab, setActiveTab] = React.useState<Tab>('general');

  const [featureFlags, setFeatureFlags] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    if (settings) setFeatureFlags(settings.featureFlags);
  }, [settings]);

  const [brandingDraft, setBrandingDraft] = React.useState({
    primaryColor: '',
    fontFamily: 'system-ui' as string,
    headerWeight: 'regular' as HeaderWeight,
    backgroundStyle: 'solid' as BackgroundStyle,
  });
  React.useEffect(() => {
    if (branding) {
      setBrandingDraft({
        primaryColor: branding.primaryColor,
        fontFamily: branding.fontFamily,
        headerWeight: branding.headerWeight,
        backgroundStyle: branding.backgroundStyle,
      });
    }
  }, [branding]);

  const [graceDays, setGraceDays] = React.useState('7');
  React.useEffect(() => {
    if (settings?.featureFlags) {
      if (settings.featureFlags.mfa_grace_1d) setGraceDays('1');
      else if (settings.featureFlags.mfa_grace_3d) setGraceDays('3');
      else if (settings.featureFlags.mfa_grace_5d) setGraceDays('5');
      else if (settings.featureFlags.mfa_grace_7d) setGraceDays('7');
      else if (settings.featureFlags.mfa_grace_14d) setGraceDays('14');
    }
  }, [settings]);

  const handleGraceDaysChange = (value: string) => {
    setGraceDays(value);
    updateSettings({
      featureFlags: {
        ...settings?.featureFlags,
        mfa_grace_1d: value === '1',
        mfa_grace_3d: value === '3',
        mfa_grace_5d: value === '5',
        mfa_grace_7d: value === '7',
        mfa_grace_14d: value === '14',
      }
    });
  };


  return (
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Tenant Settings"
          subtitle="Configure your workspace environment and branding"
        />

        <div className="flex gap-8 border-b border-border mb-8">
          {[
            { id: 'general' as const, label: 'General', icon: SettingsIcon },
            { id: 'branding' as const, label: 'Branding', icon: Palette },
            { id: 'security' as const, label: 'Security', icon: Shield },
            { id: 'danger' as const, label: 'Danger Zone', icon: Trash2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
                <div className="flex items-end justify-between gap-4">
                  <SentryInput
                    label="Workspace Name"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Acme Corp"
                    className="flex-1"
                  />
                  <SentryButton
                    variant="accent"
                    size="sm"
                    isLoading={nameSaving}
                    disabled={!workspaceName.trim() || workspaceName.trim() === currentTenant?.name}
                    onClick={() => updateTenantName(workspaceName.trim())}
                    className="shrink-0 mb-0.5"
                  >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Save
                  </SentryButton>
                </div>
                <SentryInput
                  label="Workspace Slug"
                  value={slug}
                  disabled
                  helperText="Slugs cannot be changed after creation"
                />
              </GlassCard>

              <GlassCard tier={1} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold">Feature Flags</h3>
                  <SentryButton
                    variant="accent"
                    size="sm"
                    isLoading={settingsSaving}
                    onClick={() => updateSettings({ featureFlags })}
                  >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Save Changes
                  </SentryButton>
                </div>
                {settingsLoading ? (
                  <div className="space-y-3">
                    <SentrySkeleton className="h-12 w-full" />
                    <SentrySkeleton className="h-12 w-full" />
                  </div>
                ) : Object.keys(featureFlags).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(featureFlags).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <p className="text-sm font-body font-medium">{key}</p>
                        <button
                          onClick={() => setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className={cn(
                            'w-10 h-5 rounded-full relative cursor-pointer transition-colors',
                            value ? 'bg-accent shadow-[0_0_8px_rgba(42,191,108,0.3)]' : 'bg-black/10'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all',
                            value ? 'right-0.5' : 'left-0.5'
                          )} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-body text-muted-foreground">No feature flags configured for this workspace.</p>
                )}
              </GlassCard>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6">
              <GlassCard tier={1} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold">Brand Identity</h3>
                  <SentryButton
                    variant="accent"
                    size="sm"
                    isLoading={brandingSaving}
                    onClick={() => updateBranding(brandingDraft)}
                  >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Save Changes
                  </SentryButton>
                </div>
                {brandingLoading ? (
                  <SentrySkeleton className="h-40 w-full" />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                          Primary Color
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={brandingDraft.primaryColor || '#2ABF6C'}
                            onChange={(e) => setBrandingDraft((p) => ({ ...p, primaryColor: e.target.value }))}
                            className="h-10 w-14 rounded-sm border border-border cursor-pointer bg-transparent"
                          />
                          <SentryInput
                            value={brandingDraft.primaryColor}
                            onChange={(e) => setBrandingDraft((p) => ({ ...p, primaryColor: e.target.value }))}
                            placeholder="#2ABF6C"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                          Font Family
                        </label>
                        <select
                          value={brandingDraft.fontFamily}
                          onChange={(e) => setBrandingDraft((p) => ({ ...p, fontFamily: e.target.value }))}
                          className="w-full h-[42px] px-4 rounded-sm border border-border bg-black/5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer"
                        >
                          {FONT_FAMILY_OPTIONS.map((font) => (
                            <option key={font} value={font}>{font}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                          Header Weight
                        </label>
                        <select
                          value={brandingDraft.headerWeight}
                          onChange={(e) => setBrandingDraft((p) => ({ ...p, headerWeight: e.target.value as HeaderWeight }))}
                          className="w-full h-[42px] px-4 rounded-sm border border-border bg-black/5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer"
                        >
                          <option value="regular">Regular</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                          Background Style
                        </label>
                        <select
                          value={brandingDraft.backgroundStyle}
                          onChange={(e) => setBrandingDraft((p) => ({ ...p, backgroundStyle: e.target.value as BackgroundStyle }))}
                          className="w-full h-[42px] px-4 rounded-sm border border-border bg-black/5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer"
                        >
                          <option value="solid">Solid</option>
                          <option value="gradient">Gradient</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                        Logo
                      </label>
                      <div className="flex items-center gap-4">
                        {branding?.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={branding.logoUrl} alt="Workspace logo" className="h-10 w-10 rounded-sm object-contain bg-black/5" />
                        )}
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadLogo(file);
                            }}
                          />
                          <span className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border border-border bg-black/5 text-xs font-body hover:bg-black/10 transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            {logoUploading ? 'Uploading...' : 'Upload Logo'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <GlassCard tier={1} className="p-8 space-y-6">
                <h3 className="text-sm font-display font-semibold">Social Login Providers</h3>
                {settingsLoading ? (
                  <div className="space-y-3">
                    <SentrySkeleton className="h-14 w-full" />
                    <SentrySkeleton className="h-14 w-full" />
                  </div>
                ) : settings && settings.socialProviders.length > 0 ? (
                  <div className="space-y-4">
                    {settings.socialProviders.map((sp) => (
                      <div key={sp.provider} className="flex items-center justify-between p-4 bg-black/5 rounded-sm border border-border">
                        <div className="flex items-center gap-3">
                          <Lock className="w-4 h-4 text-muted-foreground" />
                          <div className="space-y-0.5">
                            <p className="text-sm font-body font-medium capitalize">{sp.provider}</p>
                            <p className="text-xs font-body text-muted-foreground">
                              {sp.clientId ? `Client ID: ${sp.clientId}` : 'Not configured'}
                            </p>
                          </div>
                        </div>
                        <button
                          disabled={socialSaving}
                          onClick={() => updateSocialProvider({ provider: sp.provider, enabled: !sp.enabled })}
                          className={cn(
                            'w-10 h-5 rounded-full relative cursor-pointer transition-colors disabled:opacity-50',
                            sp.enabled ? 'bg-accent shadow-[0_0_8px_rgba(42,191,108,0.3)]' : 'bg-black/10'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all',
                            sp.enabled ? 'right-0.5' : 'left-0.5'
                          )} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-body text-muted-foreground">No social login providers configured for this workspace.</p>
                )}
              </GlassCard>

              <GlassCard tier={1} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold text-neutral-900">Passwordless Sign-In</h3>
                  <SentryButton
                    variant="accent"
                    size="sm"
                    isLoading={settingsSaving}
                    onClick={() => updateSettings({
                      featureFlags: {
                        ...settings?.featureFlags,
                        magicLinkEnabled: !!featureFlags['magicLinkEnabled'],
                        passkeyEnabled: !!featureFlags['passkeyEnabled']
                      }
                    })}
                  >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Save Settings
                  </SentryButton>
                </div>
                
                <div className="space-y-4">
                  {/* Magic Link Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-body font-medium">Magic Link Sign-In</p>
                      <p className="text-xs font-body text-neutral-500">
                        Allow users to receive a secure, one-time sign-in link via email.
                      </p>
                    </div>
                    <button
                      onClick={() => setFeatureFlags((prev) => ({ ...prev, magicLinkEnabled: !prev.magicLinkEnabled }))}
                      className={cn(
                        'w-10 h-5 rounded-full relative cursor-pointer transition-colors',
                        featureFlags['magicLinkEnabled'] ? 'bg-accent shadow-[0_0_8px_rgba(42,191,108,0.3)]' : 'bg-black/10'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        featureFlags['magicLinkEnabled'] ? 'right-0.5' : 'left-0.5'
                      )} />
                    </button>
                  </div>

                  {/* Passkey Toggle */}
                  <div className="flex items-center justify-between pt-4 border-t border-border/40">
                    <div className="space-y-0.5">
                      <p className="text-sm font-body font-medium">Passkey & Biometrics Sign-In</p>
                      <p className="text-xs font-body text-muted-foreground">
                        Allow users to register and sign in using biometrics (Touch ID / Face ID) or hardware keys.
                      </p>
                    </div>
                    <button
                      onClick={() => setFeatureFlags((prev) => ({ ...prev, passkeyEnabled: !prev.passkeyEnabled }))}
                      className={cn(
                        'w-10 h-5 rounded-full relative cursor-pointer transition-colors',
                        featureFlags['passkeyEnabled'] ? 'bg-accent shadow-[0_0_8px_rgba(42,191,108,0.3)]' : 'bg-black/10'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        featureFlags['passkeyEnabled'] ? 'right-0.5' : 'left-0.5'
                      )} />
                    </button>
                  </div>
                </div>
              </GlassCard>

              <GlassCard tier={1} className="p-8 space-y-6">
                <h3 className="text-sm font-display font-semibold">MFA & Authentication Policies</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground block">
                      MFA Grace Period
                    </label>
                    <select
                      value={graceDays}
                      onChange={(e) => handleGraceDaysChange(e.target.value)}
                      className="w-full h-[42px] px-4 rounded-sm border border-border bg-black/5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer"
                    >
                      <option value="1">1 Day</option>
                      <option value="3">3 Days</option>
                      <option value="5">5 Days</option>
                      <option value="7">7 Days (Default)</option>
                      <option value="14">14 Days</option>
                    </select>
                    <p className="text-xs font-body text-muted-foreground mt-1.5">
                      The maximum duration (grace period) a user can log in and access this tenant's console without enabling multi-factor authentication (MFA).
                    </p>
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
                   <SentryButton variant="destructive" className="h-10 px-6" disabled title="Workspace deletion is not yet available">
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

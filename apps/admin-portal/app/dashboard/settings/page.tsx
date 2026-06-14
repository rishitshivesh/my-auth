"use client"

import { useState } from "react"
import { SentryButton, SentrySkeleton } from "@repo/ui"

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import {
  useTenantSettings,
  useUpdateTenantSettings,
  useUpdateSocialProvider,
} from "@/lib/queries"
import { Key, Mail, Lock, ChevronDown, ChevronUp, Save } from "lucide-react"

const METHOD_FLAGS = [
  {
    key: "magicLinkEnabled",
    label: "Magic Link",
    description: "Let users sign in with a one-time link sent to their email",
    icon: Mail,
  },
  {
    key: "passkeyEnabled",
    label: "Passkey",
    description: "Let users sign in with biometrics or device PIN (WebAuthn)",
    icon: Key,
  },
]

const SOCIAL_PROVIDERS = [
  { id: "google",    label: "Google",    icon: "G" },
  { id: "github",    label: "GitHub",    icon: "GH" },
  { id: "microsoft", label: "Microsoft", icon: "M" },
]

export default function SettingsPage() {
  const { data: settings, isLoading } = useTenantSettings()
  const updateSettings = useUpdateTenantSettings()
  const updateSocial = useUpdateSocialProvider()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Record<string, { clientId: string; clientSecret: string }>>({})

  const toggleFlag = async (key: string, current: boolean) => {
    await updateSettings.mutateAsync({ featureFlags: { [key]: !current } })
  }

  const toggleSocial = async (provider: string, current: boolean) => {
    await updateSocial.mutateAsync({ provider, enabled: !current })
  }

  const saveSocialCredentials = async (provider: string) => {
    const creds = credentials[provider]
    if (!creds) return
    await updateSocial.mutateAsync({
      provider,
      enabled: true,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret || undefined,
    })
    setExpanded(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <SentrySkeleton className="h-8 w-48" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SentrySkeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        </main>
      </div>
    )
  }

  const flags = settings?.featureFlags || {}
  const socialProviders = settings?.socialProviders || []

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Login Settings</h1>
            <p className="text-xs text-muted-foreground">
              Control which authentication methods are available to your users
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl space-y-8">

            {/* Password — always on */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Core Methods
              </h2>
              <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">Always enabled — cannot be turned off</p>
                  </div>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                  Always on
                </span>
              </div>
            </section>

            {/* Feature flag methods */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Passwordless Methods
              </h2>
              <div className="space-y-3">
                {METHOD_FLAGS.map(({ key, label, description, icon: Icon }) => {
                  const enabled = flags[key] ?? false
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                          <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleFlag(key, enabled)}
                        disabled={updateSettings.isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Social providers */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Social Providers
              </h2>
              <div className="space-y-3">
                {SOCIAL_PROVIDERS.map(({ id, label, icon }) => {
                  const providerConfig = socialProviders.find((p) => p.provider === id)
                  const enabled = providerConfig?.enabled ?? false
                  const isExpanded = expanded === id

                  return (
                    <div key={id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg font-semibold text-sm ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {icon}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {providerConfig?.clientId ? "Custom credentials" : "Shared app"}
                              {providerConfig?.hasSecret ? " · Secret configured" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => toggleSocial(id, enabled)}
                            disabled={updateSocial.isPending}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                            />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border p-4 bg-muted/30 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Optional: override with your own OAuth app credentials. Leave blank to use the shared Fort Knox app.
                          </p>
                          <div className="space-y-2">
                            <label className="text-xs font-medium">Client ID</label>
                            <input
                              type="text"
                              placeholder={providerConfig?.clientId || "Leave blank for shared app"}
                              defaultValue={providerConfig?.clientId || ""}
                              onChange={(e) =>
                                setCredentials((prev) => ({
                                  ...prev,
                                  [id]: { ...prev[id], clientId: e.target.value, clientSecret: prev[id]?.clientSecret ?? "" },
                                }))
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium">Client Secret</label>
                            <input
                              type="password"
                              placeholder={providerConfig?.hasSecret ? "••••••••••••" : "Leave blank for shared app"}
                              onChange={(e) =>
                                setCredentials((prev) => ({
                                  ...prev,
                                  [id]: { ...prev[id], clientSecret: e.target.value, clientId: prev[id]?.clientId ?? "" },
                                }))
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <SentryButton
                            size="sm"
                            onClick={() => saveSocialCredentials(id)}
                            disabled={updateSocial.isPending}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save credentials
                          </SentryButton>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

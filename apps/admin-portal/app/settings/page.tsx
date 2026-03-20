'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
  useAdminTeam,
  useAddTeamMember,
  useRemoveTeamMember,
  type TeamMember,
} from '@/lib/admin-queries'
import { formatRelativeTime } from '@/lib/utils'

const TABS = ['general', 'team'] as const
type Tab = (typeof TABS)[number]

function AdminSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">FK</div>
        <div>
          <p className="text-sm font-semibold text-foreground">Fort Knox</p>
          <p className="text-xs text-muted-foreground">Superadmin</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {[
          { label: 'Dashboard', href: '/dashboard', icon: '⊞' },
          { label: 'Tenants', href: '/tenants', icon: '🏢' },
          { label: 'Users', href: '/users', icon: '👥' },
          { label: 'Audit Logs', href: '/audit-logs', icon: '📋' },
          { label: 'Settings', href: '/settings', icon: '⚙' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              item.href === '/settings'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

function GeneralSettings() {
  const { data: settings, isLoading } = usePlatformSettings()
  const { mutate: updateSettings, isPending } = useUpdatePlatformSettings()

  const [platformName, setPlatformName] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [allowPublicSignup, setAllowPublicSignup] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [saved, setSaved] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Initialize form from fetched data once
  if (settings && !initialized) {
    setPlatformName(settings.platformName)
    setSupportEmail(settings.supportEmail ?? '')
    setAllowPublicSignup(settings.allowPublicSignup)
    setMaintenanceMode(settings.maintenanceMode)
    setInitialized(true)
  }

  function handleSave() {
    updateSettings(
      { platformName, supportEmail: supportEmail || undefined, allowPublicSignup, maintenanceMode },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Platform</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Platform Name</label>
          <input
            type="text"
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Support Email</label>
          <input
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@fortknox.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Allow Public Signup</p>
            <p className="text-xs text-muted-foreground">New tenants can self-register on the platform</p>
          </div>
          <button
            role="switch"
            aria-checked={allowPublicSignup}
            onClick={() => setAllowPublicSignup((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              allowPublicSignup ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                allowPublicSignup ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Maintenance Mode</p>
            <p className="text-xs text-muted-foreground">Block all auth requests across all tenants</p>
          </div>
          <button
            role="switch"
            aria-checked={maintenanceMode}
            onClick={() => setMaintenanceMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              maintenanceMode ? 'bg-destructive' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                maintenanceMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between pt-1">
          {saved && (
            <span className="text-xs text-emerald-600 font-medium">Settings saved</span>
          )}
          <div className="ml-auto">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* SMTP Status */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">SMTP Configuration</h2>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              settings?.smtpConfigured
                ? 'bg-emerald-500/10 text-emerald-700'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                settings?.smtpConfigured ? 'bg-emerald-500' : 'bg-muted-foreground'
              }`}
            />
            {settings?.smtpConfigured ? 'Configured' : 'Not configured'}
          </span>
          {settings?.smtpHost && (
            <span className="text-xs text-muted-foreground">{settings.smtpHost}</span>
          )}
        </div>
        {!settings?.smtpConfigured && (
          <p className="text-xs text-muted-foreground">
            Set <code className="text-foreground">SMTP_HOST</code> in your environment to enable transactional email.
          </p>
        )}
      </div>
    </div>
  )
}

function TeamSettings() {
  const { data: members, isLoading } = useAdminTeam()
  const { mutate: addMember, isPending: isAdding } = useAddTeamMember()
  const { mutate: removeMember } = useRemoveTeamMember()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  function handleAdd() {
    if (!email.trim()) return
    setError(null)
    addMember(
      { email: email.trim() },
      {
        onSuccess: () => setEmail(''),
        onError: (e) => setError(e.message),
      }
    )
  }

  function handleRemove(member: TeamMember) {
    setRemovingId(member.id)
    removeMember(member.id, {
      onSettled: () => setRemovingId(null),
      onError: (e) => alert(e.message),
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Superadmin Team</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Members with the <code className="text-foreground">fortknox-internal</code> role can access this admin portal.
          </p>
        </div>

        {/* Add member */}
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="colleague@fortknox.com"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleAdd}
            disabled={!email.trim() || isAdding}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isAdding ? 'Adding…' : 'Add Member'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Member list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : members && members.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {member.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                      {member.addedAt && ` · Added ${formatRelativeTime(member.addedAt)}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(member)}
                  disabled={removingId === member.id}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  {removingId === member.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No team members yet. Add your first superadmin above.
          </p>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-border bg-card px-8 py-4">
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Platform configuration and team management</p>

          <div className="flex gap-0.5 mt-4 -mb-4">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'general' ? 'General' : 'Team'}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {tab === 'general' && <GeneralSettings />}
          {tab === 'team' && <TeamSettings />}
        </main>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SlugInput } from '@/components/slug-input'
import { useCreateTenant } from '@/lib/admin-queries'

type Plan = 'free' | 'pro' | 'enterprise'

const PLANS: { id: Plan; name: string; price: string; limits: string[] }[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0/mo',
    limits: ['1,000 MAU', '2 social providers', 'Community support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29/mo',
    limits: ['10,000 MAU', 'All social providers', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    limits: ['Unlimited MAU', 'SAML/SCIM', 'Dedicated support'],
  },
]

export default function NewTenantPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1 fields
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugAvailable, setSlugAvailable] = useState(false)
  const [plan, setPlan] = useState<Plan>('free')

  // Step 2 fields
  const [ownerEmail, setOwnerEmail] = useState('')

  const [error, setError] = useState<string | null>(null)

  const { mutate: createTenant, isPending } = useCreateTenant()

  const step1Valid = name.trim().length > 0 && slug.length >= 4 && slugAvailable && plan

  function handleCreate() {
    setError(null)
    createTenant(
      { name: name.trim(), slug, plan, ownerEmail: ownerEmail || undefined },
      {
        onSuccess: (tenant) => {
          router.push(`/tenants/${tenant.id}?created=1`)
        },
        onError: (err) => {
          setError(err.message)
        },
      }
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">FK</div>
          <div><p className="text-sm font-semibold text-foreground">Fort Knox</p><p className="text-xs text-muted-foreground">Superadmin</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { label: 'Dashboard', href: '/dashboard', icon: '⊞' },
            { label: 'Tenants', href: '/tenants', icon: '🏢' },
            { label: 'Users', href: '/users', icon: '👥' },
            { label: 'Audit Logs', href: '/audit-logs', icon: '📋' },
            { label: 'Settings', href: '/settings', icon: '⚙' },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${item.href === '/tenants' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <span className="text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border bg-card px-8 py-4">
          <Link href="/tenants" className="text-muted-foreground hover:text-foreground text-sm">← Tenants</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-sm font-semibold text-foreground">New Tenant</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${s === step ? 'bg-primary text-primary-foreground' : s < step ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {s < step ? '✓' : s}
                  </div>
                  <span className={`text-sm ${s === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {s === 1 ? 'Basic Info' : 'Owner Account'}
                  </span>
                  {s < 2 && <span className="text-muted-foreground mx-1">→</span>}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-8">
              {step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Configure the new tenant's core details.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Tenant Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Acme Corporation"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Slug <span className="text-destructive">*</span>
                      </label>
                      <SlugInput
                        value={slug}
                        onChange={setSlug}
                        onAvailabilityChange={setSlugAvailable}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used in URLs: <code className="text-foreground">{slug || 'your-slug'}.auth.fortknox.com</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Plan <span className="text-destructive">*</span>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {PLANS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPlan(p.id)}
                            className={`rounded-xl border p-4 text-left transition-all ${plan === p.id ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
                          >
                            <p className="font-semibold text-foreground text-sm">{p.name}</p>
                            <p className="text-xs font-medium text-primary mt-0.5">{p.price}</p>
                            <ul className="mt-2 space-y-0.5">
                              {p.limits.map((l) => (
                                <li key={l} className="text-xs text-muted-foreground">• {l}</li>
                              ))}
                            </ul>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={!step1Valid}
                      onClick={() => setStep(2)}
                      className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Owner Account</h2>
                    <p className="mt-1 text-sm text-muted-foreground">The first admin user for this tenant.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Owner Email</label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      An invitation will be sent to this email address.
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {/* Summary */}
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm space-y-2">
                    <p className="font-medium text-foreground">Summary</p>
                    <div className="text-muted-foreground space-y-1">
                      <p>Name: <span className="text-foreground">{name}</span></p>
                      <p>Slug: <span className="text-foreground">{slug}</span></p>
                      <p>Plan: <span className="text-foreground capitalize">{plan}</span></p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleCreate}
                      className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:bg-primary/90 transition-colors"
                    >
                      {isPending && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      )}
                      Create Tenant
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

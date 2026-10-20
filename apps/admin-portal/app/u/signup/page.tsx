"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AuthLayout } from "@/components/layouts/AuthLayout"
import { SentryButton, SentryInput, GlassCard } from "@repo/ui"
import { useRegister } from "@/lib/queries"
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react"
import { getErrorMessage } from "@/lib/api-error";

export default function SignupPage() {
  const router = useRouter()
  const { mutate: register, isPending } = useRegister()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    register(
      { email, password, firstName: firstName || undefined, lastName: lastName || undefined },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setError(getErrorMessage(err)),
      },
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="space-y-8 py-8 text-center animate-fade-up">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <CheckCircle2 className="w-10 h-10" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-display font-semibold">Check your inbox</h2>
            <p className="text-sm font-body text-muted-foreground">
              We sent a verification link to <span className="text-foreground font-medium">{email}</span>.
              Click it to activate your account.
            </p>
          </div>
          <SentryButton variant="ghost" className="w-full" onClick={() => router.push("/u/login")}>
            Back to Sign In
          </SentryButton>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-8 animate-fade-up">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent mb-2">
            <UserPlus className="w-4 h-4" />
            <span className="text-[10px] font-display font-bold uppercase tracking-wider">Create Account</span>
          </div>
          <h2 className="text-2xl font-display font-light text-foreground">Get started</h2>
          <p className="text-sm font-body text-muted-foreground">Create your Scrolloop Sentry account.</p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <SentryInput
              label="First Name"
              placeholder="Jane"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
            <SentryInput
              label="Last Name"
              placeholder="Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <SentryInput
            label="Email"
            type="email"
            placeholder="jane@acme.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <SentryInput
            label="Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText="Minimum 8 characters"
          />

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 p-3 rounded-sm border border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <SentryButton type="submit" className="w-full" variant="accent" isLoading={isPending}>
            Create Account
          </SentryButton>
        </div>

        <p className="text-center text-[11px] font-body text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/u/login")}
            className="text-accent hover:underline"
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}

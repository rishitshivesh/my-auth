"use client"

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@scrolloop/sdk"
import { getErrorMessage } from "@/lib/api-error";

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { claimSocialSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ct = searchParams.get("ct")
    const errorParam = searchParams.get("error")

    if (errorParam) {
      setError(decodeURIComponent(errorParam))
      return
    }

    if (!ct) {
      setError("Missing completion token")
      return
    }

    claimSocialSession(ct)
      .then((result: unknown) => {
        // Attempt to derive the tenant slug from the session result.
        // The result may carry tenantSlug directly (SDK shape) or we fall back
        // to the sentry tenant as the admin-portal default.
        let slug: string | undefined
        if (
          result !== null &&
          typeof result === "object" &&
          "tenantSlug" in result &&
          typeof (result as Record<string, unknown>).tenantSlug === "string"
        ) {
          slug = (result as Record<string, string>).tenantSlug
        }
        const destination = slug ? `/t/${slug}/dashboard` : "/t/sentry/dashboard"
        router.replace(destination)
      })
      .catch((err: unknown) => setError(getErrorMessage(err, "Authentication failed")))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-medium">Authentication failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/u/login" className="text-primary text-sm underline">
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  )
}

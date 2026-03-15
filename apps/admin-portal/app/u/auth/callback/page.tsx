"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@fortknox/sdk"

export default function AuthCallbackPage() {
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
      .then(() => router.replace("/dashboard"))
      .catch((err) => setError(err?.message || "Authentication failed"))
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

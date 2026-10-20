"use client"

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@scrolloop/sdk"
import { authClient } from "@/lib/auth-client"
import { getErrorMessage } from "@/lib/api-error";

function MagicLinkInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { verifyMagicLink } = useAuth()
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      setStatus("error")
      setErrorMsg("Missing token in link")
      return
    }

    verifyMagicLink(token)
      .then(() => {
        setStatus("success")
        const session = authClient.getSessionClaims()
        const slug = session?.tenantSlug ?? process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG ?? "sentry"
        setTimeout(() => router.replace(`/t/${slug}/dashboard`), 1500)
      })
      .catch((err: unknown) => {
        setStatus("error")
        setErrorMsg(getErrorMessage(err, "This magic link has expired or already been used."))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-4">
        {status === "verifying" && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Signing you in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium">Signed in successfully!</p>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Link invalid or expired</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <a href="/u/login" className="text-primary text-sm underline block">
              Request a new magic link
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <MagicLinkInner />
    </Suspense>
  )
}

"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthLayout } from "@/components/layouts/AuthLayout"
import { SentryButton } from "@repo/ui"
import { useVerifyEmail } from "@/lib/queries"
import { CheckCircle2, AlertCircle } from "lucide-react"

function VerifyEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mutate: verifyEmail } = useVerifyEmail()
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      setStatus("error")
      setErrorMsg("No verification token found in this link.")
      return
    }

    verifyEmail(token, {
      onSuccess: () => setStatus("success"),
      onError: (err) => {
        setStatus("error")
        setErrorMsg(err.message || "This verification link has expired or already been used.")
      },
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthLayout>
      <div className="space-y-8 py-8 text-center animate-fade-up">
        {status === "verifying" && (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" />
            <p className="text-sm font-body text-muted-foreground">Verifying your email address...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <CheckCircle2 className="w-10 h-10" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Email verified</h2>
              <p className="text-sm font-body text-muted-foreground">
                Your account is active. You can now sign in.
              </p>
            </div>
            <SentryButton variant="accent" className="w-full" onClick={() => router.push("/u/login")}>
              Sign In
            </SentryButton>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <AlertCircle className="w-10 h-10" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Verification failed</h2>
              <p className="text-sm font-body text-muted-foreground">{errorMsg}</p>
            </div>
            <SentryButton variant="ghost" className="w-full" onClick={() => router.push("/u/login")}>
              Back to Sign In
            </SentryButton>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="py-12 flex justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        </AuthLayout>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  )
}

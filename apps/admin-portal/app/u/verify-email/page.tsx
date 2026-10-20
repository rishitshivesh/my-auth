"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthLayout } from "@/components/layouts/AuthLayout"
import { SentryButton } from "@repo/ui"
import { useVerifyEmail, useResendVerification } from "@/lib/queries"
import { useAuth } from "@scrolloop/sdk"
import { CheckCircle2, AlertCircle, Mail, LogOut } from "lucide-react"
import { getErrorMessage } from "@/lib/api-error";

function VerifyEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout } = useAuth()
  const { mutate: verifyEmail } = useVerifyEmail()
  const { mutate: resendVerification, isPending: resending } = useResendVerification()
  const [status, setStatus] = useState<"verifying" | "success" | "error" | "prompt">("verifying")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      if (user && !user.emailVerified) {
        setStatus("prompt")
      } else {
        setStatus("error")
        setErrorMsg("No verification token found in this link.")
      }
      return
    }

    verifyEmail(token, {
      onSuccess: () => setStatus("success"),
      onError: (err) => {
        setStatus("error")
        setErrorMsg(getErrorMessage(err, "This verification link has expired or already been used."))
      },
    })
  }, [user, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = () => {
    if (user?.email) {
      resendVerification(user.email)
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push("/u/login")
  }

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
            <SentryButton variant="accent" className="w-full font-display" onClick={() => router.push("/u/login")}>
              Sign In
            </SentryButton>
          </>
        )}

        {status === "prompt" && user && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <Mail className="w-8 h-8" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold text-neutral-900">Verify your email</h2>
              <p className="text-sm font-body text-neutral-600">
                Please verify your email address to access the portal. We sent a verification link to <strong className="text-neutral-800">{user.email}</strong>.
              </p>
            </div>
            <div className="space-y-3 pt-4">
              <SentryButton
                variant="accent"
                className="w-full font-display text-xs"
                onClick={handleResend}
                isLoading={resending}
              >
                Resend Verification Link
              </SentryButton>
              <SentryButton
                variant="ghost"
                className="w-full font-display text-xs text-neutral-600 hover:text-neutral-900 flex items-center justify-center gap-2 border border-border/40"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </SentryButton>
            </div>
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
            <SentryButton variant="ghost" className="w-full font-display text-xs border border-border/40" onClick={() => router.push("/u/login")}>
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


"use client"

import { useState } from "react"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function VerifyEmailPage() {
  const [showEmailChange, setShowEmailChange] = useState(false)
  const [email, setEmail] = useState("user@example.com")

  const handleVerify = async (code: string) => {
    console.log("Verifying email:", { email, code })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return (
    <UniversalAuthLayout
      heroTitle="Verify your email"
      heroSubtitle="Confirm your identity to activate your account"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Email verification</h2>
          <p className="mt-2 text-sm text-muted-foreground">Check your inbox for a verification code</p>
        </div>

        {!showEmailChange ? (
          <VerifyEmailForm email={email} onSubmit={handleVerify} onChangeEmail={() => setShowEmailChange(true)} />
        ) : (
          <div className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground placeholder-muted-foreground"
              placeholder="Enter your email"
            />
            <button
              onClick={() => setShowEmailChange(false)}
              className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90"
            >
              Send code
            </button>
          </div>
        )}
      </div>
    </UniversalAuthLayout>
  )
}

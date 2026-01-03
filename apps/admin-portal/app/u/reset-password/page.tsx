"use client"

import { useState } from "react"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<"request" | "reset">("request")

  const handleSubmit = async (data: any) => {
    if (stage === "request") {
      console.log("Password reset requested for:", data.email)
      // Simulate sending reset email
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setStage("reset")
    } else {
      console.log("Password reset with:", data)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setStage("request")
    }
  }

  return (
    <UniversalAuthLayout
      heroTitle="Reset your password"
      heroSubtitle="We'll help you regain access to your account"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {stage === "request" ? "Forgot password?" : "Create new password"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {stage === "request"
              ? "Enter your email to receive a password reset link"
              : "Enter the code we sent and create a new password"}
          </p>
        </div>
        <ResetPasswordForm stage={stage} onSubmit={handleSubmit} />
      </div>
    </UniversalAuthLayout>
  )
}

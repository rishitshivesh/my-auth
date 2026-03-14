"use client"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function ResetPasswordPage() {
  return (
    <UniversalAuthLayout
      heroTitle="Reset your password"
      heroSubtitle="We'll help you regain access to your account"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Forgot password?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we'll send you a reset code
          </p>
        </div>
        <ResetPasswordForm primaryColor="#6366f1" />
      </div>
    </UniversalAuthLayout>
  )
}

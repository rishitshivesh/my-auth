"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { useEmailAuthFlow } from "@/hooks/use-email-auth-flow"
import { getAuthConfig } from "@/lib/auth-config"
import { EmailStep } from "./email-step"
import { MethodSelectionStep } from "./method-selection-step"
import { CredentialsStep } from "./credentials-step"
import { useEffect, useState } from "react"
import { useAuth } from "@fortknox/sdk"

interface StepBasedAuthFlowProps {
  primaryColor?: string
}

export function StepBasedAuthFlow({ primaryColor = "#6366f1" }: StepBasedAuthFlowProps) {
  const router = useRouter()
  const flow = useEmailAuthFlow();
  const { login, user } = useAuth();
  const [passwordPolicy, setPasswordPolicy] = useState<any>(null)

  useEffect(() => {
    getAuthConfig().then((config) => setPasswordPolicy(config.passwordPolicy))
  }, [])

  const handleEmailSubmit = async (email: string) => {
    try {
      await flow.submitEmail(email)
    } catch (err) {
      console.error("[v0] Email submission error:", err)
    }
  }

  const handleCredentialsSubmit = async (email: string, password?: string) => {
    try {
      await login({ email, password });

    if (user) {
        console.log("User logged in:", user);
    }
      // TODO: Redirect to dashboard or requested page
      // router.push("/dashboard")
    } catch (err) {
      console.error("[v0] Credentials submission error:", err)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {flow.step === "email" && (
        <EmailStep
          key="email"
          onSubmit={handleEmailSubmit}
          loading={flow.loading}
          error={flow.error}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "method-selection" && flow.loginIntent && (
        <MethodSelectionStep
          key="methods"
          loginIntent={flow.loginIntent}
          onSelectMethod={flow.selectMethod}
          onChangeEmail={flow.goBack}
          loading={flow.loading}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "credentials" && flow.selectedMethod && flow.loginIntent && (
        <CredentialsStep
          key="credentials"
          email={flow.email}
          method={flow.selectedMethod}
          onSubmit={handleCredentialsSubmit}
          onBack={flow.goBack}
          loading={flow.loading}
          error={flow.error}
          passwordPolicy={passwordPolicy}
          primaryColor={primaryColor}
        />
      )}
    </AnimatePresence>
  )
}

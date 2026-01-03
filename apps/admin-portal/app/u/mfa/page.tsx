"use client"

import { useState, useEffect } from "react"
import { AdvancedMFAChallenge } from "@/components/auth/advanced-mfa-challenge"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"
import { getAuthConfig, type AuthConfig } from "@/lib/auth-config"

export default function MFAPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)

  useEffect(() => {
    getAuthConfig().then((cfg) => {
      setConfig(cfg)
      if (cfg.mfa.methods.length > 0) {
        setSelectedMethod(cfg.mfa.methods[0].id)
      }
    })
  }, [])

  const handleMFASubmit = async (methodId: string, code: string) => {
    console.log("MFA verification:", { methodId, code })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const handleMethodChange = (methodId: string) => {
    console.log("MFA method changed:", methodId)
    setSelectedMethod(methodId)
  }

  return (
    <UniversalAuthLayout
      heroTitle="Two-factor authentication"
      heroSubtitle="Secure your account with a second factor"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Verify your identity</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete the verification to continue signing in</p>
        </div>

        {config && (
          <AdvancedMFAChallenge
            availableMethods={config.mfa.methods}
            onSubmit={handleMFASubmit}
            onMethodChange={handleMethodChange}
            primaryColor="#6366f1"
            maxAttempts={config.mfa.maxAttempts}
          />
        )}
      </div>
    </UniversalAuthLayout>
  )
}

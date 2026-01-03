"use client"

import { useState, useEffect } from "react"
import { MultiOptionLogin } from "@/components/auth/multi-option-login"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"
import { getAuthConfig, type AuthConfig } from "@/lib/auth-config"

export default function LoginPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null)

  useEffect(() => {
    getAuthConfig().then(setConfig)
  }, [])

  const handleEmailPasswordSubmit = async (email: string, password: string) => {
    console.log("Email/password login:", { email, password })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const handleMagicLinkSubmit = async (email: string) => {
    console.log("Magic link request:", { email })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const handlePasskeySubmit = async (credential: any) => {
    console.log("Passkey authentication:", credential)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const handleSocialClick = async (provider: string) => {
    console.log("Social login:", { provider })
  }

  return (
    <UniversalAuthLayout
      heroTitle="Welcome back"
      heroSubtitle="Sign in to your Fort Knox account to continue"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choose your preferred authentication method</p>
        </div>

        {config && (
          <MultiOptionLogin
            loginOptions={config.loginOptions}
            passwordPolicy={config.passwordPolicy}
            onEmailPasswordSubmit={handleEmailPasswordSubmit}
            onMagicLinkSubmit={handleMagicLinkSubmit}
            onPasskeySubmit={handlePasskeySubmit}
            onSocialClick={handleSocialClick}
            primaryColor="#6366f1"
          />
        )}
      </div>
    </UniversalAuthLayout>
  )
}

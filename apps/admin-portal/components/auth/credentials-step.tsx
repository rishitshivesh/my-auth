"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@repo/ui"
import { EnhancedPasswordInput } from "./enhanced-password-input"
import { MagicLinkForm } from "./magic-link-form"
import { PasskeyLoginButton } from "./passkey-login-button"
import type { PasswordPolicy } from "@/lib/auth-config"
import { useAuth } from "@fortknox/sdk"

interface CredentialsStepProps {
  email: string
  method: string
  onSubmit: (email: string, password?: string) => Promise<void>
  onBack: () => void
  loading?: boolean
  error?: string | null
  passwordPolicy?: PasswordPolicy
  primaryColor?: string
}

function MagicLinkFormWrapper({ email, primaryColor }: { email: string; primaryColor: string }) {
  const { sendMagicLink } = useAuth()
  const [stage, setStage] = useState<"request" | "sent" | "expired">("request")

  const handleSubmit = async (inputEmail: string) => {
    await sendMagicLink(inputEmail)
    setStage("sent")
  }

  const handleResend = async () => {
    await sendMagicLink(email)
  }

  return (
    <MagicLinkForm
      stage={stage}
      email={email}
      onSubmit={handleSubmit}
      onResend={handleResend}
      primaryColor={primaryColor}
    />
  )
}

export function CredentialsStep({
  email,
  method,
  onSubmit,
  onBack,
  loading = false,
  error,
  passwordPolicy,
  primaryColor = "#6366f1",
}: CredentialsStepProps) {
  const [password, setPassword] = useState("")
  const { initiateSocialLogin } = useAuth()

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(email, password)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">
            {method === "password" ? "Enter password" : method === "magicLink" ? "Magic link" : "Use passkey"}
          </h2>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        <motion.button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="text-xs text-primary hover:underline disabled:opacity-50"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Change method
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {method === "password" && (
          <motion.form
            key="password"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            onSubmit={handlePasswordSubmit}
            className="space-y-6"
          >
            <EnhancedPasswordInput
              value={password}
              onChange={setPassword}
              policy={passwordPolicy}
              primaryColor={primaryColor}
              showStrength={false}
              required
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" defaultChecked />
                <span className="text-muted-foreground">Remember this device</span>
              </label>
              <a href="/u/reset-password" className="text-primary hover:underline">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password}
              style={primaryColor ? { backgroundColor: primaryColor } : undefined}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </motion.form>
        )}

        {method === "magicLink" && (
          <motion.div
            key="magicLink"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <MagicLinkFormWrapper email={email} primaryColor={primaryColor} />
          </motion.div>
        )}

        {method === "passkey" && (
          <motion.div
            key="passkey"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="p-4 rounded-lg bg-muted/50 border border-muted text-center text-sm text-muted-foreground">
              Use your registered passkey (fingerprint, face ID, or device PIN) to sign in
            </div>

            <PasskeyLoginButton email={email} primaryColor={primaryColor} />
          </motion.div>
        )}

        {method.startsWith("social-") && (
          <motion.div
            key="social"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="p-4 rounded-lg bg-muted/50 border border-muted text-center">
              <p className="text-sm font-medium text-foreground mb-2">
                Continue with {method.replace("social-", "")}
              </p>
              <p className="text-xs text-muted-foreground">You'll be redirected to sign in securely</p>
            </div>
            <Button
              onClick={() => initiateSocialLogin(method.replace("social-", ""))}
              disabled={loading}
              className="w-full"
              style={primaryColor ? { backgroundColor: primaryColor } : undefined}
            >
              {loading ? "Connecting..." : `Continue with ${method.replace("social-", "")}`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

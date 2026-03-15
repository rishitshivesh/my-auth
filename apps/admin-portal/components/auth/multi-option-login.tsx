"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Card } from "@repo/ui"
import { EnhancedPasswordInput } from "./enhanced-password-input"
import { EmailInput } from "../../components/inputs/email-input"
import { MagicLinkForm } from "./magic-link-form"
import { PasskeyLoginButton } from "./passkey-login-button"
import type { LoginOption, PasswordPolicy } from "../../lib/auth-config"

interface MultiOptionLoginProps {
  loginOptions: LoginOption[]
  onEmailPasswordSubmit?: (email: string, password: string) => void
  onMagicLinkSubmit?: (email: string) => void
  onPasskeySubmit?: (credential: any) => void
  onSocialClick?: (provider: string) => void
  passwordPolicy?: PasswordPolicy
  primaryColor?: string
}

export function MultiOptionLogin({
  loginOptions,
  onEmailPasswordSubmit,
  onMagicLinkSubmit,
  onPasskeySubmit,
  onSocialClick,
  passwordPolicy,
  primaryColor = "#6366f1",
}: MultiOptionLoginProps) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(loginOptions[0]?.id || null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const currentMethod = loginOptions.find((opt) => opt.id === selectedMethod)

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (onEmailPasswordSubmit) {
        await onEmailPasswordSubmit(email, password)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLinkSubmit = async (magicEmail: string) => {
    setLoading(true)
    try {
      if (onMagicLinkSubmit) {
        await onMagicLinkSubmit(magicEmail)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Login method selector - only show if multiple options */}
      {loginOptions.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-2"
        >
          {loginOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setSelectedMethod(option.id)
                setEmail("")
                setPassword("")
              }}
              type="button"
              className="w-full"
            >
              <Card
                className={`p-3 cursor-pointer transition-all text-left ${
                  selectedMethod === option.id ? "ring-2 bg-primary/5 dark:bg-primary/10" : "hover:border-primary/50"
                }`}
                style={selectedMethod === option.id ? {  borderColor: primaryColor } : {}}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{option.label}</p>
                  <motion.div
                    initial={false}
                    animate={selectedMethod === option.id ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="w-5 h-5 rounded-full"
                    style={{
                      backgroundColor: selectedMethod === option.id ? primaryColor : "transparent",
                    }}
                  />
                </div>
              </Card>
            </button>
          ))}
        </motion.div>
      )}

      {/* Content based on selected method */}
      <AnimatePresence mode="wait">
        {selectedMethod === "email-password" && (
          <motion.form
            key="email-password"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            onSubmit={handleEmailPasswordSubmit}
            className="space-y-6"
          >
            <EmailInput value={email} onChange={setEmail} required />

            <EnhancedPasswordInput
              value={password}
              onChange={setPassword}
              policy={passwordPolicy}
              primaryColor={primaryColor}
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
              disabled={loading}
              style={primaryColor ? { backgroundColor: primaryColor } : undefined}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </motion.form>
        )}

        {selectedMethod === "magic-link" && (
          <motion.div
            key="magic-link"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <MagicLinkForm email={email} onSubmit={handleMagicLinkSubmit} primaryColor={primaryColor} />
          </motion.div>
        )}

        {selectedMethod === "passkey" && (
          <motion.div
            key="passkey"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="p-4 rounded-lg bg-muted/50 border border-muted text-center text-sm text-muted-foreground">
              Use your registered passkey (fingerprint, face ID, or device PIN) to sign in
            </div>

            <PasskeyLoginButton email={email} primaryColor={primaryColor} />

            {email && <input type="hidden" value={email} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      {/* Social login */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Button
            variant="outline"
            type="button"
            className="w-full bg-transparent"
            onClick={() => onSocialClick?.("google")}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </Button>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Button
            variant="outline"
            type="button"
            className="w-full bg-transparent"
            onClick={() => onSocialClick?.("github")}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </Button>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button
            variant="outline"
            type="button"
            className="w-full bg-transparent"
            onClick={() => onSocialClick?.("twitter")}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.633 7.997c.013.175.013.349.013.523 0 5.325-4.053 11.461-11.46 11.461-2.282 0-4.402-.661-6.194-1.888.324.037.636.037.973.037 1.9 0 3.649-.616 5.035-1.637-1.805-.037-3.304-1.226-3.829-2.85.287.046.574.061.87.061.9 0 1.781-.184 2.589-.543C3.926 9.604 2.999 7.12 2.999 4.382c0-1.457.789-2.814 2.084-3.637 2.026 2.5 5.061 4.134 8.475 4.307-.108-.589-.108-1.189-.108-1.777 0-2.279 1.832-4.134 4.125-4.134 1.187 0 2.25.488 3.004 1.272.937-.184 1.814-.525 2.583-1.003-.31.995-.969 1.832-1.805 2.354.83-.111 1.649-.322 2.401-.671-.55.831-1.226 1.563-1.903 2.146z" />
            </svg>
          </Button>
        </motion.div>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <a href="/u/signup" className="text-primary hover:underline">
          Sign up
        </a>
      </p>
    </div>
  )
}

"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@repo/ui"
import { Lock, Mail, Fingerprint, Chrome } from "lucide-react"
import type { LoginIntentResponse } from "@/hooks/use-email-auth-flow"

interface MethodSelectionStepProps {
  loginIntent: LoginIntentResponse
  onSelectMethod: (method: string) => void
  onChangeEmail: () => void
  loading?: boolean
  primaryColor?: string
}

export function MethodSelectionStep({
  loginIntent,
  onSelectMethod,
  onChangeEmail,
  loading = false,
  primaryColor = "#6366f1",
}: MethodSelectionStepProps) {
  const { methods, preferredMethod, branding } = loginIntent

  const methodOptions = [
    {
      id: "password",
      label: "Password",
      description: "Sign in with your password",
      icon: Lock,
      enabled: methods.password,
    },
    {
      id: "magicLink",
      label: "Magic Link",
      description: "We'll send you a link",
      icon: Mail,
      enabled: methods.magicLink,
    },
    {
      id: "passkey",
      label: "Passkey",
      description: "Use your fingerprint or face",
      icon: Fingerprint,
      enabled: methods.passkey,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-sm text-muted-foreground">{loginIntent.email}</p>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {methodOptions.map((option, index) => {
            if (!option.enabled) return null

            const Icon = option.icon
            const isPreferred = option.id === preferredMethod

            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <button onClick={() => onSelectMethod(option.id)} disabled={loading} className="w-full text-left">
                  <Card
                    className={`p-4 cursor-pointer transition-all border-2 ${
                      isPreferred ? "ring-2 ring-offset-2 dark:ring-offset-slate-950" : "hover:border-primary/50"
                    }`}
                    style={
                      isPreferred
                        ? {
                            borderColor: primaryColor,
                            backgroundColor: `${primaryColor}08`,
                          }
                        : {}
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" style={isPreferred ? { color: primaryColor } : {}} />
                        <div>
                          <p className="font-medium text-foreground">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </div>
                      {isPreferred && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Recommended
                        </motion.div>
                      )}
                    </div>
                  </Card>
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {methods.social && methods.social.length > 0 && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {methods.social.map((provider) => (
              <motion.button
                key={provider}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectMethod(`social-${provider}`)}
                disabled={loading}
                className="border border-border rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Chrome className="inline h-4 w-4 mr-2" />
                {provider === "google" ? "Google" : provider === "github" ? "GitHub" : provider}
              </motion.button>
            ))}
          </div>
        </>
      )}

      <motion.button
        type="button"
        onClick={onChangeEmail}
        disabled={loading}
        className="w-full text-sm text-primary hover:underline disabled:opacity-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Use a different email
      </motion.button>
    </motion.div>
  )
}

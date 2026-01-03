"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Label, Card, Alert, AlertDescription } from "@repo/ui"
import { MFAMethodSelector } from "./mfa-method-selector"
import { AlertCircle, Clock } from "lucide-react"
import type { MFAMethod } from "../../lib/auth-config"

interface AdvancedMFAChallengeProps {
  availableMethods: MFAMethod[]
  onSubmit?: (methodId: string, code: string) => void
  onMethodChange?: (methodId: string) => void
  primaryColor?: string
  maxAttempts?: number
}

export function AdvancedMFAChallenge({
  availableMethods,
  onSubmit,
  onMethodChange,
  primaryColor = "#6366f1",
  maxAttempts = 5,
}: AdvancedMFAChallengeProps) {
  const [selectedMethod, setSelectedMethod] = useState(availableMethods[0]?.id)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [showMethodSelector, setShowMethodSelector] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCountdown])

  const currentMethod = availableMethods.find((m) => m.id === selectedMethod)
  const remainingAttempts = maxAttempts - attempts
  const isLocked = remainingAttempts <= 0

  const handleMethodSelect = (methodId: string) => {
    setSelectedMethod(methodId)
    setCode("")
    setShowMethodSelector(false)
    if (onMethodChange) {
      onMethodChange(methodId)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMethod || code.length < 6 || isLocked) return

    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(selectedMethod, code)
      }
    } finally {
      setLoading(false)
      setAttempts(attempts + 1)
    }
  }

  const handleResend = () => {
    setResendCountdown(30)
    setCode("")
  }

  if (isLocked) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Too many failed attempts. Please try again in 15 minutes.</AlertDescription>
        </Alert>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {!showMethodSelector ? (
          <motion.div
            key="challenge"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <Card className="p-4 bg-muted/30 border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{currentMethod?.name}</p>
                  <p className="text-xs text-muted-foreground">{currentMethod?.description}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMethodSelector(true)}
                  className="text-xs"
                >
                  Change method
                </Button>
              </div>
            </Card>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="mfa-code">
                  {currentMethod?.type === "time-based-otp"
                    ? "6-digit code"
                    : currentMethod?.type === "email-otp"
                      ? "Email code"
                      : "Code"}
                </Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  className="text-center text-3xl tracking-widest font-mono"
                  autoFocus
                />
              </div>

              {attempts > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  Attempt {attempts} of {maxAttempts}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length !== 6}
                style={primaryColor ? { backgroundColor: primaryColor } : undefined}
              >
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </form>

            {/* Resend / Remember device options */}
            {currentMethod?.type === "email-otp" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="text-center"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendCountdown > 0}
                  className="text-xs"
                >
                  {resendCountdown > 0 ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Resend in {resendCountdown}s
                    </span>
                  ) : (
                    "Resend code"
                  )}
                </Button>
              </motion.div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4" />
              <span className="text-muted-foreground">Remember this device for 30 days</span>
            </label>
          </motion.div>
        ) : (
          <motion.div
            key="selector"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div>
              <h3 className="font-medium mb-4">Choose verification method</h3>
              <MFAMethodSelector
                methods={availableMethods}
                selectedMethod={selectedMethod}
                onSelect={handleMethodSelect}
                primaryColor={primaryColor}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

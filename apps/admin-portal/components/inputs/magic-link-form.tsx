"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Input, Label } from "@repo/ui"
import { Mail, ArrowRight, CheckCircle } from "lucide-react"

interface MagicLinkFormProps {
  stage?: "request" | "sent" | "expired"
  email?: string
  onSubmit?: (email: string) => void
  onResend?: () => void
  primaryColor?: string
}

export function MagicLinkForm({
  stage = "request",
  email = "",
  onSubmit,
  onResend,
  primaryColor = "#6366f1",
}: MagicLinkFormProps) {
  const [inputEmail, setInputEmail] = useState(email)
  const [loading, setLoading] = useState(false)
  const [resendCount, setResendCount] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(inputEmail)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setLoading(true)
    try {
      if (onResend) {
        await onResend()
      }
      setResendCount(resendCount + 1)
    } finally {
      setLoading(false)
    }
  }

  if (stage === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div className="flex justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </motion.div>
        </div>

        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold">Check your email</h3>
          <p className="text-sm text-muted-foreground">
            We've sent a magic link to <strong>{inputEmail}</strong>. Click the link to sign in.
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 text-center text-xs text-muted-foreground">
          Link expires in 15 minutes
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="space-y-2"
        >
          <p className="text-center text-xs text-muted-foreground">Didn't receive it?</p>
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={loading || resendCount >= 3}
            className="w-full"
          >
            {loading ? "Sending..." : "Resend link"}
          </Button>
        </motion.div>

        <Button variant="ghost" className="w-full">
          Back to sign in
        </Button>
      </motion.div>
    )
  }

  if (stage === "expired") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-sm font-medium text-destructive">Link expired</p>
          <p className="text-xs text-muted-foreground mt-1">The magic link has expired. Please request a new one.</p>
        </div>

        <Button type="button" variant="outline" onClick={() => {}} className="w-full">
          Request new link
        </Button>

        <Button variant="ghost" className="w-full">
          Back to sign in
        </Button>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="magic-email">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id="magic-email"
            type="email"
            placeholder="you@example.com"
            value={inputEmail}
            onChange={(e) => setInputEmail(e.target.value)}
            required
            className="pl-10"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full group"
        disabled={loading}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Sending..." : "Send magic link"}
        <motion.div animate={{ x: loading ? 0 : 4 }} transition={{ duration: 0.2 }}>
          <ArrowRight className="ml-2 h-4 w-4" />
        </motion.div>
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        We'll send you a secure link to sign in. No password needed.
      </p>
    </form>
  )
}

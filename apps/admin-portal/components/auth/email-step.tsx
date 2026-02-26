
"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Input, Label } from "@repo/ui"
import { AlertCircle } from "lucide-react"

interface EmailStepProps {
  onSubmit: (email: string) => Promise<void>
  loading?: boolean
  error?: string | null
  primaryColor?: string
}

export function EmailStep({ onSubmit, loading = false, error, primaryColor = "#6366f1" }: EmailStepProps) {
  const [email, setEmail] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(email)
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
        <p className="text-sm text-muted-foreground">Enter your email to continue</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className={error ? "border-destructive" : ""}
        />
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex gap-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </motion.div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={loading || !email}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Checking email..." : "Continue"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Don't have an account?{" "}
        <a href="/u/signup" className="text-primary hover:underline">
          Sign up
        </a>
      </p>
    </motion.form>
  )
}

"use client"

import type React from "react"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"


interface MFAChallengeProps {
  method: "sms" | "email" | "totp"
  onSubmit?: (code: string) => void
  onResend?: () => void
  primaryColor?: string
}

export function MFAChallenge({ method, onSubmit, onResend, primaryColor }: MFAChallengeProps) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(code)
      }
    } finally {
      setLoading(false)
    }
  }

  const methodLabels = {
    sms: "SMS code",
    email: "Email code",
    totp: "Authenticator code",
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="code">{methodLabels[method]}</Label>
        <p className="text-sm text-muted-foreground">
          {method === "sms" && "We sent a code to your phone"}
          {method === "email" && "We sent a code to your email"}
          {method === "totp" && "Enter the code from your authenticator app"}
        </p>
        <Input
          id="code"
          type="text"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          maxLength={6}
          className="text-center text-2xl tracking-widest"
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading || code.length !== 6}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Verifying..." : "Verify"}
      </Button>

      <div className="text-center">
        <button type="button" onClick={onResend} className="text-sm text-primary hover:underline">
          Didn't receive the code? Resend
        </button>
      </div>
    </form>
  )
}

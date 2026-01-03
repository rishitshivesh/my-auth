"use client"

import type React from "react"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"

interface VerifyEmailFormProps {
  email?: string
  onSubmit?: (code: string) => void
  onChangeEmail?: () => void
  primaryColor?: string
}

export function VerifyEmailForm({
  email = "you@example.com",
  onSubmit,
  onChangeEmail,
  primaryColor,
}: VerifyEmailFormProps) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Verification code</Label>
        <p className="text-sm text-muted-foreground">
          We sent a code to <strong>{email}</strong>
        </p>
        <Input
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
        {loading ? "Verifying..." : "Verify email"}
      </Button>

      <div className="space-y-2 text-center text-sm">
        <button type="button" onClick={onChangeEmail} className="text-primary hover:underline block w-full">
          Use a different email
        </button>
        <button type="button" className="text-primary hover:underline">
          Resend code
        </button>
      </div>
    </form>
  )
}

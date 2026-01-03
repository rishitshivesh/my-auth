"use client"

import type React from "react"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"

interface ResetPasswordFormProps {
  stage?: "request" | "reset"
  onSubmit?: (data: any) => void
  primaryColor?: string
}

export function ResetPasswordForm({ stage = "request", onSubmit, primaryColor }: ResetPasswordFormProps) {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (stage === "reset" && password !== confirmPassword) {
      alert("Passwords do not match")
      return
    }
    setLoading(true)
    try {
      if (onSubmit) {
        if (stage === "request") {
          await onSubmit({ email })
        } else {
          await onSubmit({ code, password })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  if (stage === "request") {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">We'll send you a link to reset your password</p>
        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          style={primaryColor ? { backgroundColor: primaryColor } : undefined}
        >
          {loading ? "Sending..." : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <a href="/u/login" className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          type="text"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          maxLength={6}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Resetting..." : "Reset password"}
      </Button>
    </form>
  )
}

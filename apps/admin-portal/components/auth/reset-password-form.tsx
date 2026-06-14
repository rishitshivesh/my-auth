"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, InputOTP, InputOTPGroup, InputOTPSlot } from "@repo/ui"
import { useAuth } from "@scrolloop/sdk"

interface ResetPasswordFormProps {
  primaryColor?: string
}

export function ResetPasswordForm({ primaryColor }: ResetPasswordFormProps) {
  const router = useRouter()
  const { forgotPassword, resetPassword } = useAuth()

  const [stage, setStage] = useState<"request" | "otp" | "reset">("request")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const btnStyle = primaryColor ? { backgroundColor: primaryColor } : undefined

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email)
      setStage("otp")
    } catch (err: any) {
      setError(err?.message || "Failed to send reset code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (value: string) => {
    setOtp(value)
    if (value.length === 6) {
      setStage("reset")
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    try {
      await resetPassword(otp, password)
      router.push("/u/login?reset=success")
    } catch (err: any) {
      setError(err?.message || "Invalid or expired code. Please try again.")
      setStage("otp")
      setOtp("")
    } finally {
      setLoading(false)
    }
  }

  if (stage === "request") {
    return (
      <form onSubmit={handleRequestReset} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <p className="text-sm text-muted-foreground">
          We'll send a 6-digit code to this email address.
        </p>
        <Button type="submit" className="w-full" disabled={loading} style={btnStyle}>
          {loading ? "Sending code..." : "Send reset code"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <a href="/u/login" className="text-primary hover:underline font-medium">
            Sign in
          </a>
        </p>
      </form>
    )
  }

  if (stage === "otp") {
    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-medium text-foreground">{email}</span>
        </p>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={handleOtpChange}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Didn't receive the code?{" "}
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={() => { setStage("request"); setOtp(""); setError(null); }}
          >
            Resend
          </button>
        </p>
      </div>
    )
  }

  // stage === "reset"
  return (
    <form onSubmit={handleResetPassword} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
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
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Confirm your new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading} style={btnStyle}>
        {loading ? "Resetting password..." : "Reset password"}
      </Button>
    </form>
  )
}

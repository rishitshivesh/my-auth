"use client"

import type React from "react"

import { useState } from "react"
import { Button, Input, Label, Checkbox } from "@repo/ui"


interface SignupFormProps {
  onSubmit?: (data: SignupData) => void
  primaryColor?: string
}

interface SignupData {
  email: string
  password: string
  name: string
  agreedToTerms: boolean
}

export function SignupForm({ onSubmit, primaryColor }: SignupFormProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      alert("Passwords do not match")
      return
    }
    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit({ email, password, name, agreedToTerms: agreed })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          type="text"
          placeholder="John Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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

      <div className="flex items-center space-x-2">
        <Checkbox id="terms" checked={agreed} onCheckedChange={(checked) => setAgreed(checked as boolean)} />
        <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
          I agree to the{" "}
          <a href="#" className="text-primary hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading || !agreed}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/u/login" className="text-primary hover:underline">
          Sign in
        </a>
      </p>
    </form>
  )
}

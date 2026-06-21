"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@repo/ui"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"
import { useAuth } from "@scrolloop/sdk"
import { ShieldCheck, AlertCircle } from "lucide-react"

export default function MFAPage() {
  const router = useRouter()
  const { verifyMfaLogin } = useAuth()
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const code = digits.join("")

  const handleChange = (index: number, value: string) => {
    // Handle paste of full code
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, 6)
      const next = [...digits]
      for (let i = 0; i < 6; i++) next[i] = cleaned[i] ?? ""
      setDigits(next)
      inputRefs.current[Math.min(cleaned.length, 5)]?.focus()
      return
    }
    const digit = value.replace(/\D/g, "")
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleSubmit = useCallback(async () => {
    if (code.length !== 6 || loading) return
    const tempToken = sessionStorage.getItem("_sentry_mfa_temp_token")
    if (!tempToken) {
      setError("Session expired. Please sign in again.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await verifyMfaLogin(tempToken, code)
      sessionStorage.removeItem("_sentry_mfa_temp_token")
      router.push("/dashboard")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.")
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }, [code, loading, verifyMfaLogin, router])

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (code.length === 6) handleSubmit()
  }, [code, handleSubmit])

  return (
    <UniversalAuthLayout
      heroTitle="Two-factor authentication"
      heroSubtitle="Secure your account with a second factor"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Verify your identity</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Authenticator App</p>
            <p className="text-xs text-muted-foreground">Use an app like Google Authenticator or Authy</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* 6-box OTP input */}
          <div className="flex gap-2 justify-center">
            {digits.map((digit, i) => (
              <motion.input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={loading}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`
                  h-14 w-12 rounded-xl border text-center text-xl font-semibold
                  bg-background transition-all outline-none
                  ${digit ? "border-primary text-foreground" : "border-border text-muted-foreground"}
                  ${loading ? "opacity-50 cursor-not-allowed" : "focus:border-primary focus:ring-2 focus:ring-primary/20"}
                `}
              />
            ))}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <Button
            className="w-full"
            disabled={code.length !== 6 || loading}
            style={{ backgroundColor: "#6366f1" }}
            onClick={handleSubmit}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Wrong account?{" "}
          <a href="/u/login" className="text-primary hover:underline">
            Back to login
          </a>
        </p>
      </div>
    </UniversalAuthLayout>
  )
}

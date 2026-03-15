"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Alert, AlertDescription } from "@repo/ui"
import { Key, Loader } from "lucide-react"
import { useAuth } from "@fortknox/sdk"

interface PasskeyLoginButtonProps {
  email: string
  primaryColor?: string
}

export function PasskeyLoginButton({ email, primaryColor = "#6366f1" }: PasskeyLoginButtonProps) {
  const { startPasskeyLogin, finishPasskeyLogin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePasskeyLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys are not supported on this device or browser")
      }

      // Step 1: Get challenge from server
      const options = await startPasskeyLogin(email)

      // Step 2: Trigger browser's native passkey prompt
      const { startAuthentication } = await import("@simplewebauthn/browser")
      const assertion = await startAuthentication(options)

      // Step 3: Verify with server — sets session
      await finishPasskeyLogin(email, assertion)

      // Step 4: Redirect to dashboard
      window.location.href = "/dashboard"
    } catch (err: any) {
      // User cancelled the WebAuthn prompt (NotAllowedError) — don't show error
      if (err?.name === "NotAllowedError") {
        setError(null)
      } else {
        setError(err?.message || "Failed to authenticate with passkey")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full"
          variant="outline"
          style={primaryColor ? { borderColor: primaryColor, color: primaryColor } : undefined}
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Waiting for passkey...
            </>
          ) : (
            <>
              <Key className="mr-2 h-4 w-4" />
              Sign in with Passkey
            </>
          )}
        </Button>
      </motion.div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}
    </div>
  )
}

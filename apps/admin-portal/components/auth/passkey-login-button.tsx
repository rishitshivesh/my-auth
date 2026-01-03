"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Alert, AlertDescription } from "@repo/ui"
import { Key, Loader } from "lucide-react"

interface PasskeyLoginButtonProps {
  onAuthenticate?: (credential: any) => void
  primaryColor?: string
}

export function PasskeyLoginButton({ onAuthenticate, primaryColor = "#6366f1" }: PasskeyLoginButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePasskeyLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      // Mock WebAuthn API call
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys are not supported on this device")
      }

      // Simulate passkey challenge
      const mockCredential = {
        id: "mock-credential-123",
        type: "public-key",
        response: {
          clientJSON: JSON.stringify({
            challenge: "mock-challenge",
            origin: window.location.origin,
          }),
        },
      }

      if (onAuthenticate) {
        await onAuthenticate(mockCredential)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate with passkey")
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
          className="w-full bg-transparent border"
          variant="outline"
        >
          <Key className="mr-2 h-4 w-4" />
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Waiting for passkey...
            </>
          ) : (
            "Login with Passkey"
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

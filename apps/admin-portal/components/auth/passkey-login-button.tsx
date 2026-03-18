"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Alert, AlertDescription } from "@repo/ui"
import { Key, Loader2 } from "lucide-react"
import { useAuth } from "@fortknox/sdk"

type LoginStatus =
  | 'idle'
  | 'requesting_options'
  | 'waiting_for_device'
  | 'verifying'
  | 'success'
  | 'error'

interface PasskeyLoginButtonProps {
  email: string
  primaryColor?: string
}

export function PasskeyLoginButton({ email, primaryColor = "#6366f1" }: PasskeyLoginButtonProps) {
  const { startPasskeyLogin, finishPasskeyLogin } = useAuth()
  const [status, setStatus] = useState<LoginStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePasskeyLogin = async () => {
    if (!window.PublicKeyCredential) {
      setStatus('error')
      setErrorMessage('Passkeys are not supported on this device or browser')
      return
    }

    setErrorMessage(null)

    // Step 1: get options from server
    setStatus('requesting_options')
    let serverData: any
    try {
      serverData = await startPasskeyLogin(email)
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err?.message || 'Failed to start passkey login')
      return
    }

    const { sessionNonce, ...optionsJSON } = serverData

    // Step 2: invoke browser authenticator
    setStatus('waiting_for_device')
    let assertion: any
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      assertion = await startAuthentication({ optionsJSON })
    } catch (err: any) {
      // User cancelled the WebAuthn prompt — don't show error
      if (err?.name === 'NotAllowedError') {
        setStatus('idle')
        return
      }
      setStatus('error')
      if (err?.name === 'NotSupportedError') {
        setErrorMessage('Your device does not support passkeys.')
      } else {
        setErrorMessage(err?.message || 'Something went wrong. Please try again.')
      }
      return
    }

    // Step 3: verify with server
    setStatus('verifying')
    try {
      await finishPasskeyLogin(email, assertion, sessionNonce)
      setStatus('success')
      window.location.href = '/dashboard'
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err?.message || 'Failed to authenticate with passkey')
    }
  }

  const isLoading = status === 'requesting_options' || status === 'waiting_for_device' || status === 'verifying'

  const loadingLabel = {
    requesting_options: 'Contacting server...',
    waiting_for_device: 'Waiting for passkey...',
    verifying: 'Verifying...',
  }[status as 'requesting_options' | 'waiting_for_device' | 'verifying'] ?? 'Sign in with Passkey'

  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={isLoading || status === 'success'}
          className="w-full"
          variant="outline"
          style={primaryColor ? { borderColor: primaryColor, color: primaryColor } : undefined}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            <>
              <Key className="mr-2 h-4 w-4" />
              Sign in with Passkey
            </>
          )}
        </Button>
      </motion.div>

      {status === 'error' && errorMessage && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
          </Alert>
        </motion.div>
      )}
    </div>
  )
}

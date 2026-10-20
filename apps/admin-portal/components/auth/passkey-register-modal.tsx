"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Label, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui"
import { Key, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { useAuth } from "@scrolloop/sdk"
import { getErrorMessage, SentryApiError } from "@/lib/api-error";

type RegistrationStatus =
  | 'idle'
  | 'requesting_options'
  | 'waiting_for_device'
  | 'verifying'
  | 'success'
  | 'error'

interface PasskeyRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  primaryColor?: string
}

export function PasskeyRegisterModal({
  open,
  onOpenChange,
  onSuccess,
  primaryColor = "#6366f1",
}: PasskeyRegisterModalProps) {
  const { client } = useAuth()
  const [status, setStatus] = useState<RegistrationStatus>('idle')
  const [deviceName, setDeviceName] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isInProgress = status === 'requesting_options' || status === 'waiting_for_device' || status === 'verifying'

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleRegister()
  }

  async function handleRegister() {
    // Step 1: get options from server via SDK client
    // Calls POST /mfa/webauthn/register/start internally
    setStatus('requesting_options')
    let options: any
    try {
      const res = await client.request({
        url: `${client.getBaseURL()}/mfa/webauthn/register/start`,
        method: 'POST',
      })
      if (!res.ok) {
        throw SentryApiError.fromResponse(res)
      }
      options = res.data?.data || res.data
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(getErrorMessage(err, 'Failed to start registration'))
      return
    }

    // Step 2: browser credential API — THIS IS THE LINE THAT WAS MISSING
    setStatus('waiting_for_device')
    let registrationResponse: any
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      registrationResponse = await startRegistration({ optionsJSON: options })
    } catch (err: any) {
      setStatus('error')
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Registration was cancelled.')
      } else if (err.name === 'NotSupportedError') {
        setErrorMessage('Your device does not support passkeys.')
      } else {
        setErrorMessage('Something went wrong. Please try again.')
      }
      return
    }

    // Step 3: verify with server via SDK
    setStatus('verifying')
    try {
      await client.finishPasskeyRegistration(registrationResponse, deviceName.trim() || undefined)
      setStatus('success')
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(getErrorMessage(err, 'Verification failed. Please try again.'))
    }
  }

  const handleClose = () => {
    if (!isInProgress) {
      onOpenChange(false)
      setStatus('idle')
      setDeviceName("")
      setErrorMessage(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Register Passkey
                </DialogTitle>
                <DialogDescription>Give your passkey a name to identify it later</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleNameSubmit} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="device-name">Device Name (optional)</Label>
                  <Input
                    id="device-name"
                    placeholder="e.g., iPhone 14 Pro, MacBook Pro"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Continue
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {isInProgress && (
            <motion.div
              key="in-progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 py-8"
            >
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-medium">
                  {status === 'requesting_options' && 'Contacting server...'}
                  {status === 'waiting_for_device' && 'Check your device or browser prompt...'}
                  {status === 'verifying' && 'Verifying with server...'}
                </p>
              </div>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 py-8"
            >
              <div className="flex justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </motion.div>
              </div>
              <div className="text-center space-y-4">
                <p className="font-medium">Passkey added successfully!</p>
                <Button
                  onClick={() => {
                    onSuccess?.()
                    onOpenChange(false)
                    setStatus('idle')
                    setDeviceName("")
                  }}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 py-8"
            >
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-destructive/10">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <div className="text-center space-y-4">
                <p className="text-sm text-destructive">{errorMessage}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus('idle')
                    setErrorMessage(null)
                  }}
                  className="w-full"
                >
                  Try again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

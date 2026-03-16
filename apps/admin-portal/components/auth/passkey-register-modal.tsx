"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Label, Alert, AlertDescription, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui"
import { Key, CheckCircle2 } from "lucide-react"
import { useAuth } from "@fortknox/sdk"

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
  const [step, setStep] = useState<"name" | "register" | "success">("name")
  const [deviceName, setDeviceName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (deviceName.trim()) {
      handleRegister()
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    setStep("register")

    try {
      if (!window.PublicKeyCredential) {
        throw new Object({ name: "NotSupportedError", message: "Your browser does not support passkeys" })
      }

      // Step 1: Get registration options from server
      const options = await client.startPasskeyRegistration()

      // Step 2: Invoke the browser's native credential API
      let registrationResponse: any
      try {
        const { startRegistration } = await import("@simplewebauthn/browser")
        registrationResponse = await startRegistration({ optionsJSON: options })
      } catch (browserErr: any) {
        if (browserErr?.name === "NotAllowedError") {
          setError("Registration cancelled")
          setStep("name")
          return
        }
        if (
          browserErr?.name === "NotSupportedError" ||
          browserErr?.name === "SecurityError"
        ) {
          setError("Your browser does not support passkeys")
          setStep("name")
          return
        }
        throw browserErr
      }

      // Step 3: Finish registration on server
      await client.finishPasskeyRegistration(
        registrationResponse,
        deviceName.trim() || undefined,
      )

      setStep("success")

      // Step 4: Notify parent and close
      if (onSuccess) {
        onSuccess()
      }

      setTimeout(() => {
        onOpenChange(false)
        setStep("name")
        setDeviceName("")
      }, 2000)
    } catch (err: any) {
      setError(err?.message || "Failed to register passkey")
      setStep("name")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false)
      setStep("name")
      setDeviceName("")
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {step === "name" && (
            <motion.div
              key="name"
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
                  <Label htmlFor="device-name">Device Name</Label>
                  <Input
                    id="device-name"
                    placeholder="e.g., iPhone 14 Pro, MacBook Pro"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    autoFocus
                  />
                </div>

                {error && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    Continue
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {step === "register" && (
            <motion.div
              key="register"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 py-8"
            >
              <div className="flex justify-center">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2 }}
                  className="p-4 rounded-full bg-primary/10"
                >
                  <Key className="h-8 w-8 text-primary" />
                </motion.div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-medium">Complete passkey registration</p>
                <p className="text-sm text-muted-foreground">Use your device&apos;s face/fingerprint or PIN to confirm</p>
              </div>
            </motion.div>
          )}

          {step === "success" && (
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
              <div className="text-center space-y-2">
                <p className="font-medium">Passkey registered successfully</p>
                <p className="text-sm text-muted-foreground">You can now use this device to sign in</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

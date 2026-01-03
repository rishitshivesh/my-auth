"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Label, Alert, AlertDescription, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui"
import { Key, CheckCircle2 } from "lucide-react"

interface PasskeyRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegister?: (passkey: any) => void
  primaryColor?: string
}

export function PasskeyRegisterModal({
  open,
  onOpenChange,
  onRegister,
  primaryColor = "#6366f1",
}: PasskeyRegisterModalProps) {
  const [step, setStep] = useState<"name" | "register" | "success">("name")
  const [deviceName, setDeviceName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (deviceName.trim()) {
      setStep("register")
      handleRegister()
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys are not supported on this device")
      }

      // Mock WebAuthn registration
      const mockPasskey = {
        id: Math.random().toString(36),
        name: deviceName,
        created: new Date().toLocaleDateString(),
        lastUsed: null,
        device: "iPhone 14 Pro",
      }

      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      setStep("success")

      if (onRegister) {
        await onRegister(mockPasskey)
      }

      setTimeout(() => {
        onOpenChange(false)
        setStep("name")
        setDeviceName("")
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register passkey")
      setStep("name")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    required
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
                    onClick={() => onOpenChange(false)}
                    className="flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={!deviceName.trim()}>
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
                <p className="text-sm text-muted-foreground">Use your device's face/fingerprint or PIN to confirm</p>
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

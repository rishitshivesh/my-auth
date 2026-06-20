"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Card, Input, Label, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@repo/ui"
import { AlertCircle, RefreshCw, Smartphone, Mail, Key, Lock } from "lucide-react"
import { TOTPSetup } from "../../components/auth/totp-setup"

export interface MFAMethod {
  id: string
  name: string
  type: "totp" | "email-otp" | "backup-codes" | "passkey"
  enabled: boolean
  verified: boolean
  lastUpdated?: string
}

interface MFASettingsProps {
  methods: MFAMethod[]
  primaryColor?: string
  onToggle?: (methodId: string, enabled: boolean) => void
  onRegenerateCodes?: () => void
}

export function MFASettings({ methods, primaryColor = "#6366f1", onToggle, onRegenerateCodes }: MFASettingsProps) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)

  const getIcon = (type: string) => {
    const iconClass = "h-5 w-5"
    switch (type) {
      case "totp":
        return <Smartphone className={iconClass} />
      case "email-otp":
        return <Mail className={iconClass} />
      case "backup-codes":
        return <Key className={iconClass} />
      case "passkey":
        return <Lock className={iconClass} />
      default:
        return null
    }
  }

  const handleSetupMethod = (methodId: string) => {
    setSelectedMethod(methodId)
    setSetupOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {methods.map((method, index) => (
          <motion.div
            key={method.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">{getIcon(method.type)}</div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{method.name}</p>
                      {method.verified && (
                        <Badge variant="secondary" className="text-xs">
                          Verified
                        </Badge>
                      )}
                    </div>
                    {method.lastUpdated && (
                      <p className="text-xs text-muted-foreground mt-1">Last updated: {method.lastUpdated}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {method.verified ? (
                    <div className="flex gap-2">
                      {method.type === "backup-codes" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onRegenerateCodes}
                          className="text-xs bg-transparent"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Regenerate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onToggle?.(method.id, false)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleSetupMethod(method.id)}
                      style={primaryColor ? { backgroundColor: primaryColor } : undefined}
                    >
                      Set up
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          {selectedMethod === "totp" && (
            <>
              <DialogHeader>
                <DialogTitle>Set up authenticator app</DialogTitle>
                <DialogDescription>Use an authenticator app to generate 6-digit codes</DialogDescription>
              </DialogHeader>
              <TOTPSetup
                email="user@example.com"
                secret="JBSWY3DPEBLW64TMMQ6G63JNN2HXE3J5"
                qrCodeUrl="/placeholder.svg?height=200&width=200"
                onVerify={(_code) => {
                  // SPRINT_N: wire to useVerifyTotp() mutation
                  setSetupOpen(false)
                }}
                primaryColor={primaryColor}
              />
            </>
          )}

          {selectedMethod === "email-otp" && (
            <>
              <DialogHeader>
                <DialogTitle>Enable email verification</DialogTitle>
                <DialogDescription>Receive codes via email for two-factor authentication</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      We'll send a code to your email address when you sign in
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setSetupOpen(false)}
                  style={primaryColor ? { backgroundColor: primaryColor } : undefined}
                >
                  Enable email verification
                </Button>
              </div>
            </>
          )}

          {selectedMethod === "backup-codes" && (
            <>
              <DialogHeader>
                <DialogTitle>Save backup codes</DialogTitle>
                <DialogDescription>Use these codes if you lose access to your other methods</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted">
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i}>
                        {String(10000 + Math.random() * 90000).slice(0, 5)}-
                        {String(10000 + Math.random() * 90000).slice(0, 5)}
                      </div>
                    ))}
                  </div>
                </div>
                <Button variant="outline" className="w-full bg-transparent">
                  Copy codes
                </Button>
                <Button
                  className="w-full"
                  onClick={() => setSetupOpen(false)}
                  style={primaryColor ? { backgroundColor: primaryColor } : undefined}
                >
                  I've saved my codes
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

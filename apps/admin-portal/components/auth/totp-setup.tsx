"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Input, Label, Card } from "@repo/ui"
import { Copy, Check } from "lucide-react"

interface TOTPSetupProps {
  email: string
  secret: string
  qrCodeUrl: string
  onVerify: (code: string) => void
  primaryColor?: string
}

export function TOTPSetup({ email, secret, qrCodeUrl, onVerify, primaryColor = "#6366f1" }: TOTPSetupProps) {
  const [code, setCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onVerify(code)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex justify-center"
      >
        <Card className="p-4">
          <div
            className="w-48 h-48 rounded-lg flex items-center justify-center"
            style={{
              backgroundImage: `url(${qrCodeUrl})`,
              backgroundSize: "cover",
            }}
          />
        </Card>
      </motion.div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)
        </p>

        <div className="space-y-2">
          <Label className="text-xs">Can't scan? Enter this key manually:</Label>
          <div className="flex gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">{secret}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 bg-transparent"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="totp-code">Enter the 6-digit code</Label>
        <Input
          id="totp-code"
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
          className="text-center text-2xl tracking-widest"
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading || code.length !== 6}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {loading ? "Verifying..." : "Verify & Enable"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Save these codes in a safe place. You'll need them if you lose access to your authenticator.
      </p>
    </form>
  )
}

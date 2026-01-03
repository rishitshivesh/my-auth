"use client"

import { motion } from "framer-motion"
import { Card } from "@repo/ui"
import { Smartphone, Mail, Key, Shield } from "lucide-react"
import type { MFAMethod } from "../../lib/auth-config"

interface MFAMethodSelectorProps {
  methods: MFAMethod[]
  selectedMethod?: string
  onSelect: (methodId: string) => void
  primaryColor?: string
}

export function MFAMethodSelector({
  methods,
  selectedMethod,
  onSelect,
  primaryColor = "#6366f1",
}: MFAMethodSelectorProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "time-based-otp":
        return <Smartphone className="h-6 w-6" />
      case "email-otp":
        return <Mail className="h-6 w-6" />
      case "backup-codes":
        return <Key className="h-6 w-6" />
      case "passkey":
        return <Shield className="h-6 w-6" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        {methods.map((method, index) => (
          <motion.div
            key={method.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <button type="button" onClick={() => onSelect(method.id)} className="w-full">
              <Card
                className={`p-4 cursor-pointer transition-all ${
                  selectedMethod === method.id ? "ring-2 bg-primary/5 dark:bg-primary/10" : "hover:border-primary/50"
                }`}
                style={selectedMethod === method.id ? { borderColor: primaryColor } : {}}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="rounded-lg p-2"
                    style={selectedMethod === method.id ? { backgroundColor: `${primaryColor}20` } : {}}
                  >
                    <div style={selectedMethod === method.id ? { color: primaryColor } : {}}>
                      {getIcon(method.type)}
                    </div>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-sm">{method.name}</p>
                    <p className="text-xs text-muted-foreground">{method.description}</p>
                  </div>
                  <motion.div initial={false} animate={selectedMethod === method.id ? { scale: 1 } : { scale: 0 }}>
                    <div className="rounded-full w-5 h-5" style={{ backgroundColor: primaryColor }} />
                  </motion.div>
                </div>
              </Card>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

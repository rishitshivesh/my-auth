"use client"

import { motion } from "framer-motion"
import { Card, Badge} from "@repo/ui"
import { Lock, Smartphone, Mail, Key, RotateCcw, AlertCircle, MapPin, Clock } from "lucide-react"

export interface AuditEvent {
  id: string
  type:
    | "device_login"
    | "mfa_challenge"
    | "magic_link_sent"
    | "passkey_used"
    | "password_changed"
    | "token_revoked"
    | "mfa_enabled"
    | "mfa_disabled"
  title: string
  description: string
  timestamp: string
  location: string
  ipAddress: string
  device: string
  status: "success" | "failed" | "suspicious"
}

interface AuditLogListProps {
  events: AuditEvent[]
  onFilter?: (type: string) => void
}

export function AuditLogList({ events, onFilter }: AuditLogListProps) {
  const getIcon = (type: AuditEvent["type"]) => {
    const iconClass = "h-4 w-4"
    switch (type) {
      case "device_login":
        return <Smartphone className={iconClass} />
      case "mfa_challenge":
        return <Lock className={iconClass} />
      case "magic_link_sent":
        return <Mail className={iconClass} />
      case "passkey_used":
        return <Key className={iconClass} />
      case "password_changed":
        return <RotateCcw className={iconClass} />
      case "token_revoked":
        return <AlertCircle className={iconClass} />
      default:
        return null
    }
  }

  const getStatusColor = (status: AuditEvent["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
      case "failed":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      case "suspicious":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
      default:
        return "bg-gray-100 dark:bg-gray-900/30"
    }
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          <Card className="p-4 hover:border-primary/50 transition-colors">
            <div className="flex gap-3">
              <div className={`mt-1 p-2 rounded-lg ${getStatusColor(event.status)} flex items-center justify-center`}>
                {getIcon(event.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                  </div>

                  <Badge
                    variant="secondary"
                    className={`text-xs flex-shrink-0 ${getStatusColor(event.status)} border-0`}
                  >
                    {event.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {event.timestamp}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-xs">IP: {event.ipAddress}</span>
                    <span className="text-xs text-muted-foreground">({event.device})</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

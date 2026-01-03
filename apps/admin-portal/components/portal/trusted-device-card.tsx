"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Input, Label, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@repo/ui"
import { Smartphone, MapPin, Clock, MoreVertical, Trash2 } from "lucide-react"

export interface TrustedDevice {
  id: string
  name: string
  type: "phone" | "tablet" | "desktop"
  os: string
  lastActive: string
  location: string
  isCurrent: boolean
}

interface TrustedDeviceCardProps {
  device: TrustedDevice
  onRemove?: (deviceId: string) => void
}

export function TrustedDeviceCard({ device, onRemove }: TrustedDeviceCardProps) {
  const [hovering, setHovering] = useState(false)

  const getDeviceIcon = () => {
    switch (device.type) {
      case "phone":
        return <Smartphone className="h-5 w-5" />
      case "tablet":
        return <Smartphone className="h-5 w-5 rotate-90" />
      default:
        return <Smartphone className="h-5 w-5" />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
    >
      <Card className="p-4 hover:border-primary/50 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">{getDeviceIcon()}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{device.name}</p>
                {device.isCurrent && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                    This device
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-1">{device.os}</p>

              <div className="flex flex-col gap-1 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last active: {device.lastActive}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {device.location}
                </div>
              </div>
            </div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: hovering ? 1 : 0 }} transition={{ duration: 0.2 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onRemove?.(device.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove device
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </div>
      </Card>
    </motion.div>
  )
}

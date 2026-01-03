"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Card, Alert, AlertDescription } from "@repo/ui"

import { Globe, LogOut, AlertTriangle } from "lucide-react"

export interface Session {
  id: string
  device: string
  location: string
  ipAddress: string
  browser: string
  lastActive: string
  isCurrent: boolean
}

interface ActiveSessionsProps {
  sessions: Session[]
  onRevoke?: (sessionId: string) => void
  onRevokeAll?: () => void
}

export function ActiveSessions({ sessions, onRevoke, onRevokeAll }: ActiveSessionsProps) {
  const [revokedSessions, setRevokedSessions] = useState<string[]>([])

  const handleRevoke = (sessionId: string) => {
    setRevokedSessions([...revokedSessions, sessionId])
    onRevoke?.(sessionId)
  }

  const unusualSessions = sessions.filter((s) => !s.isCurrent && revokedSessions.length === 0)

  return (
    <div className="space-y-4">
      {unusualSessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Alert className="bg-amber-100/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
              You have {unusualSessions.length} active session{unusualSessions.length !== 1 ? "s" : ""} from other
              devices
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      <div className="space-y-3">
        {sessions.map((session, index) => (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">
                    <Globe className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{session.browser}</p>
                      {session.isCurrent && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                          Current session
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">{session.device}</p>

                    <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground text-xs mb-1">Location</p>
                        <p>{session.location}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-xs mb-1">IP Address</p>
                        <p>{session.ipAddress}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-foreground text-xs mb-1">Last active</p>
                        <p>{session.lastActive}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {!session.isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(session.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Revoke
                  </Button>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {sessions.length > 1 && (
        <Button
          variant="outline"
          onClick={onRevokeAll}
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
        >
          Revoke all other sessions
        </Button>
      )}
    </div>
  )
}

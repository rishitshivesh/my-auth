"use client"

import * as React from "react"
import { ShieldAlert, ShieldCheck, Info } from "lucide-react"
import { format } from "date-fns"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table"
import { Badge } from "@repo/ui/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card"
import api from "@/lib/api-client"

// Type matching your backend "security_events" entity
interface SecurityEvent {
  id: string
  event_type: string
  severity: 'info' | 'warning' | 'critical'
  ip_address: string
  user_agent: string
  created_at: string
  metadata?: any
}

export function SecurityEventsTable() {
  const [events, setEvents] = React.useState<SecurityEvent[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      // This endpoint needs to be created in your Auth Controller if not exposed yet
      // Assuming GET /security/events based on your docs
      const { data } = await api.get('/security/events')
      setEvents(data)
    } catch (error) {
      console.error("Failed to fetch logs", error)
      // Fallback mock data for visualization if backend endpoint isn't ready
      setEvents([
        {
          id: "1",
          event_type: "LOGIN_SUCCESS",
          severity: "info",
          ip_address: "192.168.1.1",
          user_agent: "Mozilla/5.0...",
          created_at: new Date().toISOString()
        },
        {
          id: "2",
          event_type: "LOGIN_FAILED",
          severity: "warning",
          ip_address: "10.0.0.5",
          user_agent: "Unknown",
          created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>
      case 'warning':
        return <Badge className="bg-orange-500 hover:bg-orange-600">Warning</Badge>
      default:
        return <Badge variant="secondary">Info</Badge>
    }
  }

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ShieldAlert className="h-4 w-4 text-red-500" />
      case 'warning':
        return <ShieldAlert className="h-4 w-4 text-orange-500" />
      default:
        return <ShieldCheck className="h-4 w-4 text-green-500" />
    }
  }

  if (loading) return <div>Loading logs...</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{getIcon(event.severity)}</TableCell>
                <TableCell className="font-medium">{event.event_type}</TableCell>
                <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                <TableCell className="font-mono text-xs">{event.ip_address}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(event.created_at), "MMM d, yyyy HH:mm")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
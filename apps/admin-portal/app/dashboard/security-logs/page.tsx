import { Metadata } from "next"
import { SecurityEventsTable } from "@/components/security/events-table"

export const metadata: Metadata = {
  title: "Security Logs - Fort Knox",
  description: "View system access logs and security events",
}

export default function SecurityLogsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Security Logs</h1>
        <p className="text-muted-foreground">
          Monitor authentication attempts and suspicious activities across your tenant.
        </p>
      </div>
      
      <SecurityEventsTable />
    </div>
  )
}
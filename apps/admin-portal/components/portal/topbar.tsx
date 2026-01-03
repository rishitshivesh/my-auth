"use client"

import { Button, Input, Label } from "@repo/ui"

interface TopbarProps {
  title: string
  subtitle?: string
  primaryAction?: {
    label: string
    onClick: () => void
  }
  secondaryActions?: Array<{
    label: string
    onClick: () => void
  }>
}

export function Topbar({ title, subtitle, primaryAction, secondaryActions }: TopbarProps) {
  return (
    <div className="border-b border-border bg-background px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex gap-3">
          {secondaryActions?.map((action) => (
            <Button key={action.label} variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
          {primaryAction && <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>}
        </div>
      </div>
    </div>
  )
}

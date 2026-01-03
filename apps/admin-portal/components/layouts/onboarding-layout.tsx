"use client"

import type React from "react"

interface OnboardingLayoutProps {
  children: React.ReactNode
  step: number
  totalSteps: number
  logoUrl?: string
  primaryColor?: string
  tenantName?: string
}

export function OnboardingLayout({
  children,
  step,
  totalSteps,
  logoUrl,
  primaryColor = "#6366f1",
  tenantName = "Fort Knox",
}: OnboardingLayoutProps) {
  const progress = (step / totalSteps) * 100

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              FK
            </div>
            <span className="font-semibold text-foreground">{tenantName}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Step {step} of {totalSteps}
          </div>
        </div>
      </div>

      <div className="w-full bg-card">
        <div className="h-1 bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">{children}</div>
      </div>
    </div>
  )
}
